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

resource "cloudflare_email_routing_address" "enquiries_inbox" {
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
    value = [cloudflare_email_routing_address.enquiries_inbox.email]
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

# --- Email: Resend domain verification records ----------------------------------------------

resource "cloudflare_dns_record" "resend" {
  for_each = { for r in var.resend_dns_records : "${r.type}-${r.name}" => r }

  zone_id  = var.zone_id
  name     = each.value.name == "@" ? var.domain : "${each.value.name}.${var.domain}"
  type     = each.value.type
  content  = each.value.content
  priority = each.value.priority
  ttl      = 1 # automatic
  proxied  = false
  comment  = "Resend domain verification"
}

# --- Admin page: Cloudflare Access ----------------------------------------------------------

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
  auto_redirect_to_identity  = false
  http_only_cookie_attribute = true

  destinations = [
    { type = "public", uri = "${var.domain}/admin" },
    { type = "public", uri = "www.${var.domain}/admin" },
  ]

  policies = [{
    id         = cloudflare_zero_trust_access_policy.staff.id
    precedence = 1
  }]
}
