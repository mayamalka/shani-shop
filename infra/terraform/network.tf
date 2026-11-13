# VCN for a flannel-overlay OKE cluster:
#   api     10.0.0.0/28   public  – Kubernetes API endpoint (reachable from admin_cidrs only)
#   workers 10.0.10.0/24  private – nodes (egress via NAT, Oracle services via the service gateway)
#   lb      10.0.20.0/24  public  – Network Load Balancer (reachable from Cloudflare only)
# OCI gateways (internet, NAT, service) cost nothing.

locals {
  vcn_cidr      = "10.0.0.0/16"
  api_cidr      = "10.0.0.0/28"
  workers_cidr  = "10.0.10.0/24"
  lb_cidr       = "10.0.20.0/24"
  pods_cidr     = "10.244.0.0/16"
  services_cidr = "10.96.0.0/16"

  # only Cloudflare may talk to the load balancer (the VCN is IPv4-only)
  cloudflare_cidrs = data.cloudflare_ip_ranges.cloudflare.ipv4_cidrs
  oci_services     = data.oci_core_services.all.services[0]
}

data "oci_core_services" "all" {
  filter {
    name   = "name"
    values = ["All .* Services In Oracle Services Network"]
    regex  = true
  }
}

resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = [local.vcn_cidr]
  display_name   = "shani"
  dns_label      = "shani"
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "shani-igw"
  enabled        = true
}

resource "oci_core_nat_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "shani-nat"
}

resource "oci_core_service_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "shani-sgw"
  services {
    service_id = local.oci_services.id
  }
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "shani-public"
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

resource "oci_core_route_table" "private" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "shani-private"
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_nat_gateway.main.id
  }
  route_rules {
    destination       = local.oci_services.cidr_block
    destination_type  = "SERVICE_CIDR_BLOCK"
    network_entity_id = oci_core_service_gateway.main.id
  }
}

# ---------- security lists ----------

resource "oci_core_security_list" "api" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "shani-k8s-api"

  dynamic "ingress_security_rules" {
    for_each = var.admin_cidrs
    content {
      description = "kubectl"
      protocol    = "6"
      source      = ingress_security_rules.value
      tcp_options {
        min = 6443
        max = 6443
      }
    }
  }
  dynamic "ingress_security_rules" {
    for_each = [6443, 12250]
    content {
      description = "workers → control plane"
      protocol    = "6"
      source      = local.workers_cidr
      tcp_options {
        min = ingress_security_rules.value
        max = ingress_security_rules.value
      }
    }
  }
  ingress_security_rules {
    description = "path MTU discovery"
    protocol    = "1"
    source      = local.workers_cidr
    icmp_options {
      type = 3
      code = 4
    }
  }

  egress_security_rules {
    description      = "control plane → Oracle services"
    protocol         = "6"
    destination      = local.oci_services.cidr_block
    destination_type = "SERVICE_CIDR_BLOCK"
  }
  egress_security_rules {
    description = "control plane → kubelets"
    protocol    = "6"
    destination = local.workers_cidr
  }
  egress_security_rules {
    description = "path MTU discovery"
    protocol    = "1"
    destination = local.workers_cidr
    icmp_options {
      type = 3
      code = 4
    }
  }
}

resource "oci_core_security_list" "workers" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "shani-workers"

  ingress_security_rules {
    description = "node ↔ node and pod overlay (flannel VXLAN)"
    protocol    = "all"
    source      = local.workers_cidr
  }
  ingress_security_rules {
    description = "control plane → kubelets / webhooks"
    protocol    = "6"
    source      = local.api_cidr
  }
  ingress_security_rules {
    description = "path MTU discovery"
    protocol    = "1"
    source      = "0.0.0.0/0"
    icmp_options {
      type = 3
      code = 4
    }
  }
  ingress_security_rules {
    description = "load balancer health checks"
    protocol    = "6"
    source      = local.lb_cidr
    tcp_options {
      min = 10256
      max = 10256
    }
  }
  ingress_security_rules {
    description = "load balancer → node ports"
    protocol    = "6"
    source      = local.lb_cidr
    tcp_options {
      min = 30000
      max = 32767
    }
  }
  # The NLB keeps the client address, so the nodes see Cloudflare's IPs
  dynamic "ingress_security_rules" {
    for_each = local.cloudflare_cidrs
    content {
      description = "Cloudflare → node ports (source preserved by the NLB)"
      protocol    = "6"
      source      = ingress_security_rules.value
      tcp_options {
        min = 30000
        max = 32767
      }
    }
  }

  egress_security_rules {
    description = "all outbound (NAT / service gateway)"
    protocol    = "all"
    destination = "0.0.0.0/0"
  }
}

resource "oci_core_security_list" "lb" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "shani-lb"

  dynamic "ingress_security_rules" {
    for_each = setproduct(local.cloudflare_cidrs, [80, 443])
    content {
      description = "Cloudflare → load balancer"
      protocol    = "6"
      source      = ingress_security_rules.value[0]
      tcp_options {
        min = ingress_security_rules.value[1]
        max = ingress_security_rules.value[1]
      }
    }
  }

  egress_security_rules {
    description = "load balancer → node ports"
    protocol    = "6"
    destination = local.workers_cidr
    tcp_options {
      min = 30000
      max = 32767
    }
  }
  egress_security_rules {
    description = "load balancer → health checks"
    protocol    = "6"
    destination = local.workers_cidr
    tcp_options {
      min = 10256
      max = 10256
    }
  }
}

# ---------- subnets ----------

resource "oci_core_subnet" "api" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  cidr_block                 = local.api_cidr
  display_name               = "shani-k8s-api"
  dns_label                  = "k8sapi"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.api.id]
  prohibit_public_ip_on_vnic = false
}

resource "oci_core_subnet" "workers" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  cidr_block                 = local.workers_cidr
  display_name               = "shani-workers"
  dns_label                  = "workers"
  route_table_id             = oci_core_route_table.private.id
  security_list_ids          = [oci_core_security_list.workers.id]
  prohibit_public_ip_on_vnic = true
}

resource "oci_core_subnet" "lb" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  cidr_block                 = local.lb_cidr
  display_name               = "shani-lb"
  dns_label                  = "lb"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.lb.id]
  prohibit_public_ip_on_vnic = false
}

# Stable public IP for the load balancer → DNS never has to change, even if the Service is re-created.
resource "oci_core_public_ip" "lb" {
  compartment_id = var.compartment_ocid
  lifetime       = "RESERVED"
  display_name   = "shani-lb"

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [private_ip_id] # attached by the cloud controller when the NLB is created
  }
}
