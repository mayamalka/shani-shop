terraform {
  required_version = ">= 1.12"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 7.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # State in OCI Object Storage (Always Free: 20 GB). Values in backend.hcl (see backend.hcl.example):
  #   terraform init -backend-config=backend.hcl
  backend "oci" {}
}

provider "oci" {
  region              = var.region
  config_file_profile = var.oci_profile
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
