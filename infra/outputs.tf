# Values that go into ../wrangler.jsonc after apply.

output "access_team_domain" {
  description = "Set as ACCESS_TEAM_DOMAIN."
  value       = local.team_domain
}

output "access_aud" {
  description = "Audience tag of the admin application. Set as ACCESS_AUD."
  value       = cloudflare_zero_trust_access_application.admin.aud
}

output "turnstile_sitekey" {
  description = "Public site key, already in public/index.html."
  value       = cloudflare_turnstile_widget.contact_form.sitekey
}

output "d1_database_id" {
  description = "Already in wrangler.jsonc as database_id."
  value       = cloudflare_d1_database.enquiries.id
}

output "enquiries_inbox_verified" {
  description = "Timestamp the destination inbox confirmed Cloudflare's verification email, or empty."
  value       = cloudflare_email_routing_address.hello_destination.verified
  sensitive   = true
}
