variable "account_id" {
  description = "Cloudflare account id that owns adaptix.uk."
  type        = string
}

variable "zone_id" {
  description = "Zone id of adaptix.uk."
  type        = string
}

variable "domain" {
  description = "Apex domain served by the Worker."
  type        = string
  default     = "adaptix.uk"
}

variable "enquiry_destination_email" {
  description = "Private inbox that hello@ forwards to. Kept out of git; set in terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "access_allowed_emails" {
  description = "People who may sign in to /admin. Kept out of git; set in terraform.tfvars."
  type        = list(string)
  sensitive   = true
}

variable "access_team_name" {
  description = "Zero Trust team name, i.e. the <team> in <team>.cloudflareaccess.com."
  type        = string
}
