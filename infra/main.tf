# Cloudflare resources around the Worker. The Worker itself, its bindings, routes, custom
# domains, cron and secrets are owned by Wrangler (../wrangler.jsonc), not by this configuration.

locals {
  team_domain = "${var.access_team_name}.cloudflareaccess.com"
}

# --- Database -------------------------------------------------------------------------------

resource "cloudflare_d1_database" "enquiries" {
  account_id            = var.account_id
  name                  = "adaptix-enquiries"
  primary_location_hint = "weur" # keep enquiry data in Western Europe
  read_replication      = { mode = "disabled" }

  lifecycle {
    # The location hint only applies at creation and is never reported back by the API,
    # so without this an imported database would be planned for replacement.
    ignore_changes = [primary_location_hint]
  }
}

# --- Contact-form bot protection ------------------------------------------------------------

resource "cloudflare_turnstile_widget" "contact_form" {
  account_id = var.account_id
  name       = "Adaptix contact form"
  domains    = [var.domain] # covers www and any other subdomain
  mode       = "managed"
  region     = "world"
}

# --- Email: hello@ forwards to the private inbox --------------------------------------------

resource "cloudflare_email_routing_settings" "zone" {
  zone_id            = var.zone_id
  support_subaddress = false
}

# The private inbox that hello@ forwards to. It was verified by hand before Terraform managed it, so it is imported
# (see imports.tf) rather than created; the previous destination is left in place, unmanaged.
resource "cloudflare_email_routing_address" "hello_destination" {
  account_id = var.account_id
  email      = var.enquiry_destination_email
}

resource "cloudflare_email_routing_rule" "hello" {
  zone_id = var.zone_id
  name    = "hello@${var.domain}"
  enabled = true

  matchers = [{
    type  = "literal"
    field = "to"
    value = "hello@${var.domain}"
  }]

  actions = [{
    type  = "forward"
    value = [cloudflare_email_routing_address.hello_destination.email]
  }]

  depends_on = [cloudflare_email_routing_settings.zone]
}

# Anything not addressed to a known mailbox is dropped, which keeps guessed addresses
# (info@, admin@ ...) from forwarding spam to the inbox.
resource "cloudflare_email_routing_catch_all" "drop" {
  zone_id = var.zone_id
  name    = "Catch-all"
  enabled = false

  matchers = [{ type = "all" }]
  actions  = [{ type = "drop" }]

  depends_on = [cloudflare_email_routing_settings.zone]
}

# --- Email: Resend sending domain -----------------------------------------------------------
# Public DNS values shown by Resend when adaptix.uk was added (region eu-west-1). Sending uses the
# `send` return-path subdomain, so nothing here touches the apex MX records that Email Routing owns.

locals {
  resend_dns_records = {
    dkim = {
      name    = "resend._domainkey"
      type    = "TXT"
      content = "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8/CqiivItfau6eWoZ/q5wFcRw/buv0t+xmncUUchFaa1La+pA8/Y7Q8qRS3wjaiweOj/f3d4PDsZyP9HVfjXPbCKLWtcF7ebDLd6wQ1JKZlWYDrQw9mPkCUurS9O14QGpXC3j9Z5/7ec9ORDDb2wRK1g0jgDSIBfWAhHwFreBsQIDAQAB"
    }
    spf_rsend = {
      name    = "rsend"
      type    = "CNAME"
      content = "rsend-euw1.forge.rmta.net"
    }
    spf_send = {
      name    = "send"
      type    = "CNAME"
      content = "send.forge.rmta.net"
    }
    dmarc = {
      name    = "_dmarc"
      type    = "TXT"
      content = "v=DMARC1; p=none;" # monitor only; tighten to quarantine once sending is proven
    }
  }
}

resource "cloudflare_dns_record" "resend" {
  for_each = local.resend_dns_records

  zone_id = var.zone_id
  name    = "${each.value.name}.${var.domain}"
  type    = each.value.type
  content = each.value.content
  ttl     = 1 # automatic
  proxied = false
  comment = "Resend sending domain"
}

# --- Edge rate limit on the enquiry endpoint -------------------------------------------------
# Stops floods before they reach the Worker. The Worker keeps its own 5-per-hour limit per address;
# this one is a short burst limit. Free-plan rules must use a 10 s period and timeout and count
# per data centre (cf.colo.id).

resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = var.zone_id
  name        = "Rate limits"
  description = "Burst protection for the contact form endpoint"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    description = "Contact form: at most 5 posts per 10 seconds per address"
    expression  = "(http.request.uri.path eq \"/api/enquiry\" and http.request.method eq \"POST\")"
    action      = "block"
    enabled     = true
    ratelimit = {
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 10
      requests_per_period = 5
      mitigation_timeout  = 10
    }
  }]
}

# --- Admin page: Cloudflare Access ----------------------------------------------------------

# Staff sign in with a one-time code sent to their email; no Cloudflare account is needed.
resource "cloudflare_zero_trust_access_identity_provider" "one_time_pin" {
  account_id = var.account_id
  name       = "Email one-time code"
  type       = "onetimepin"
  config     = {}
}

resource "cloudflare_zero_trust_access_policy" "staff" {
  account_id = var.account_id
  name       = "Adaptix staff"
  decision   = "allow"

  include = [for email in var.access_allowed_emails : { email = { email = email } }]
}

resource "cloudflare_zero_trust_access_application" "admin" {
  account_id                 = var.account_id
  name                       = "Adaptix admin"
  type                       = "self_hosted"
  domain                     = "${var.domain}/admin"
  session_duration           = "24h"
  app_launcher_visible       = false
  http_only_cookie_attribute = true

  # Only the email code method is offered, and the chooser step is skipped.
  allowed_idps              = [cloudflare_zero_trust_access_identity_provider.one_time_pin.id]
  auto_redirect_to_identity = true

  destinations = [
    { type = "public", uri = "${var.domain}/admin" },
    { type = "public", uri = "www.${var.domain}/admin" },
  ]

  policies = [{
    id         = cloudflare_zero_trust_access_policy.staff.id
    precedence = 1
  }]
}
