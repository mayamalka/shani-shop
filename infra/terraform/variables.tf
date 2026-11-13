# ---------- Oracle Cloud ----------
variable "tenancy_ocid" {
  description = "Tenancy OCID (OCI console → Profile → Tenancy)."
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment for all resources. The tenancy OCID (root compartment) is fine for a single project."
  type        = string
}

variable "region" {
  description = "OCI home region – Always Free resources only exist there (e.g. il-jerusalem-1, eu-frankfurt-1)."
  type        = string
}

variable "oci_profile" {
  description = "Profile in ~/.oci/config used for authentication."
  type        = string
  default     = "DEFAULT"
}

variable "kubernetes_version" {
  description = "OKE Kubernetes version – set in kubernetes.auto.tfvars (committed; bumped by the k8s-version workflow)."
  type        = string
}

variable "node_count" {
  description = "Worker nodes. 2 × 1 OCPU / 6 GB = the whole Always Free Ampere A1 allowance (2 OCPU / 12 GB)."
  type        = number
  default     = 2
}

variable "node_ocpus" {
  type    = number
  default = 1
}

variable "node_memory_gb" {
  type    = number
  default = 6
}

variable "node_image_id" {
  description = "Optional: pin a worker image OCID. Empty = newest OKE aarch64 image for kubernetes_version."
  type        = string
  default     = ""
}

variable "ssh_public_key" {
  description = "Optional SSH key for the worker nodes (they sit in a private subnet; debugging only)."
  type        = string
  default     = ""
}

variable "admin_cidrs" {
  description = "Who may reach the Kubernetes API (kubectl). Use your home/office IP, e.g. [\"203.0.113.7/32\"]."
  type        = list(string)
}

variable "budget_alert_email" {
  description = "Gets an email as soon as anything costs money (Always Free guard)."
  type        = string
}

# ---------- Cloudflare ----------
variable "cloudflare_api_token" {
  description = "Token with Zone:DNS:Edit, Zone:Zone Settings:Edit for the zone and Account:Workers R2 Storage:Edit."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "domain" {
  description = "The shop's domain (apex), e.g. hadoda-shani.co.il – www redirects to it."
  type        = string
}

variable "r2_location" {
  description = "R2 location hint. eeur = Eastern Europe (closest to Israel)."
  type        = string
  default     = "eeur"
}
