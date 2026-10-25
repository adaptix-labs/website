# Resources that were created by hand or by Wrangler before this configuration existed.
# After the first successful apply these blocks can be deleted.

import {
  to = cloudflare_d1_database.enquiries
  id = "${var.account_id}/${var.import_ids.d1_database}"
}

import {
  to = cloudflare_turnstile_widget.contact_form
  id = "${var.account_id}/${var.import_ids.turnstile_sitekey}"
}

import {
  to = cloudflare_email_routing_settings.zone
  id = var.zone_id
}

import {
  to = cloudflare_email_routing_catch_all.drop
  id = var.zone_id
}

import {
  to = cloudflare_email_routing_address.enquiries_inbox
  id = "${var.account_id}/${var.import_ids.email_routing_address}"
}

import {
  to = cloudflare_email_routing_rule.hello
  id = "${var.zone_id}/${var.import_ids.email_routing_rule}"
}
