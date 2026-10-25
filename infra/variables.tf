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

variable "resend_dns_records" {
  description = <<-EOT
    DNS records Resend asks for when verifying the domain. Copy them from the Resend
    dashboard after adding adaptix.uk. Example:
      [{ name = "resend._domainkey", type = "TXT", content = "p=MIGf...", priority = null },
       { name = "send", type = "MX", content = "feedback-smtp.eu-west-1.amazonses.com", priority = 10 },
       { name = "send", type = "TXT", content = "v=spf1 include:amazonses.com ~all", priority = null }]
  EOT
  type = list(object({
    name     = string
    type     = string
    content  = string
    priority = optional(number)
  }))
  default = []
}
