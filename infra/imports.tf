# One-off: adopt the existing, verified destination address for hello@ and stop managing the
# previous one without deleting it. Delete this file after the apply.

import {
  to = cloudflare_email_routing_address.hello_destination
  id = "${var.account_id}/21816f8acc784b7c9f1e74bfb3f08700"
}

removed {
  from = cloudflare_email_routing_address.enquiries_inbox

  lifecycle {
    destroy = false
  }
}
