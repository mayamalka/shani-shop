# DNS (proxied through Cloudflare: free CDN, DDoS protection, hides the origin), R2 buckets, TLS settings.

data "cloudflare_ip_ranges" "cloudflare" {}

resource "cloudflare_dns_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  type    = "A"
  content = oci_core_public_ip.lb.ip_address
  proxied = true
  ttl     = 1 # automatic
}

resource "cloudflare_dns_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  content = var.domain
  proxied = true
  ttl     = 1
}

# Product pictures + private customer photos (served only through the API). 10 GB free, no egress fees.
resource "cloudflare_r2_bucket" "media" {
  account_id = var.cloudflare_account_id
  name       = "shani-media"
  location   = var.r2_location

  lifecycle {
    prevent_destroy = true
  }
}

# PostgreSQL base backups + WAL archive (CloudNativePG Barman Cloud plugin).
resource "cloudflare_r2_bucket" "db_backups" {
  account_id = var.cloudflare_account_id
  name       = "shani-db-backups"
  location   = var.r2_location

  lifecycle {
    prevent_destroy = true
  }
}

# Origin has a real Let's Encrypt certificate → verify it ("Full (strict)").
resource "cloudflare_zone_setting" "ssl" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "ssl"
  value      = "strict"
}

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.cloudflare_zone_id
  setting_id = "min_tls_version"
  value      = "1.2"
}
