#!/usr/bin/env bash
# Prints the ids needed in terraform.tfvars for imports.tf.
# Requires CLOUDFLARE_API_TOKEN (the Terraform token) plus the account and zone ids.
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
ACCOUNT_ID="${1:?usage: lookup-ids.sh <account_id> <zone_id>}"
ZONE_ID="${2:?usage: lookup-ids.sh <account_id> <zone_id>}"
api() { curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4$1"; }

echo "d1_database           = \"$(api "/accounts/$ACCOUNT_ID/d1/database?name=adaptix-enquiries" | python3 -c 'import sys,json; r=json.load(sys.stdin)["result"]; print(r[0]["uuid"] if r else "")')\""
echo "turnstile_sitekey     = \"$(api "/accounts/$ACCOUNT_ID/challenges/widgets" | python3 -c 'import sys,json; r=json.load(sys.stdin)["result"]; print(next((w["sitekey"] for w in r if "adaptix" in w["name"].lower()), ""))')\""
echo "email_routing_address = \"$(api "/accounts/$ACCOUNT_ID/email/routing/addresses" | python3 -c 'import sys,json; r=json.load(sys.stdin)["result"]; print(r[0]["id"] if len(r)==1 else "AMBIGUOUS: " + ", ".join(a["id"]+"="+a["email"] for a in r))')\""
echo "email_routing_rule    = \"$(api "/zones/$ZONE_ID/email/routing/rules" | python3 -c 'import sys,json; r=json.load(sys.stdin)["result"]; print(next((x["id"] for x in r if any(m.get("value","").startswith("hello@") for m in x["matchers"])), ""))')\""
