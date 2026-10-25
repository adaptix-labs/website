terraform {
  required_version = ">= 1.8"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # State lives in a private Cloudflare R2 bucket (S3-compatible). Credentials and the
  # account-specific endpoint are supplied at init time from the git-ignored backend.hcl:
  #   tofu init -backend-config=backend.hcl
  backend "s3" {
    bucket                      = "adaptix-terraform-state"
    key                         = "website/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

provider "cloudflare" {
  # Reads CLOUDFLARE_API_TOKEN from the environment.
}
