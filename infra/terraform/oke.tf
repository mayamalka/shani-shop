# OKE *Basic* cluster (no control-plane fee) + one Always Free Ampere A1 node pool.

resource "oci_containerengine_cluster" "main" {
  compartment_id     = var.compartment_ocid
  name               = "shani"
  kubernetes_version = var.kubernetes_version
  vcn_id             = oci_core_vcn.main.id
  type               = "BASIC_CLUSTER" # ENHANCED_CLUSTER costs $0.10/hour – don't switch

  cluster_pod_network_options {
    cni_type = "FLANNEL_OVERLAY"
  }

  endpoint_config {
    is_public_ip_enabled = true
    subnet_id            = oci_core_subnet.api.id
  }

  options {
    service_lb_subnet_ids = [oci_core_subnet.lb.id]
    kubernetes_network_config {
      pods_cidr     = local.pods_cidr
      services_cidr = local.services_cidr
    }
  }
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_containerengine_node_pool_option" "main" {
  node_pool_option_id = oci_containerengine_cluster.main.id
  compartment_id      = var.compartment_ocid
}

locals {
  k8s_version_number = trimprefix(var.kubernetes_version, "v")
  # newest OKE image for arm64 (aarch64) and this Kubernetes version, no GPU images
  oke_arm_images = [
    for s in data.oci_containerengine_node_pool_option.main.sources : s.image_id
    if strcontains(s.source_name, "aarch64") && strcontains(s.source_name, "OKE-${local.k8s_version_number}") && !strcontains(s.source_name, "GPU")
  ]
  node_image_id = var.node_image_id != "" ? var.node_image_id : local.oke_arm_images[0]
}

resource "oci_containerengine_node_pool" "a1" {
  cluster_id         = oci_containerengine_cluster.main.id
  compartment_id     = var.compartment_ocid
  name               = "a1-free"
  kubernetes_version = var.kubernetes_version
  node_shape         = "VM.Standard.A1.Flex"
  ssh_public_key     = var.ssh_public_key != "" ? var.ssh_public_key : null

  node_shape_config {
    ocpus         = var.node_ocpus
    memory_in_gbs = var.node_memory_gb
  }

  node_source_details {
    source_type             = "IMAGE"
    image_id                = local.node_image_id
    boot_volume_size_in_gbs = 50 # 2 × 50 GB boot + 50 GB database volume = within the 200 GB free block storage
  }

  node_config_details {
    size = var.node_count
    dynamic "placement_configs" {
      for_each = data.oci_identity_availability_domains.ads.availability_domains
      content {
        availability_domain = placement_configs.value.name
        subnet_id           = oci_core_subnet.workers.id
      }
    }
  }

  # Upgrades replace nodes one at a time and never add a 3rd node (that would leave the free allowance).
  node_pool_cycling_details {
    is_node_cycling_enabled = true
    maximum_surge           = "0"
    maximum_unavailable     = "1"
  }

  node_eviction_node_pool_settings {
    eviction_grace_duration              = "PT30M"
    is_force_delete_after_grace_duration = true
  }

  initial_node_labels {
    key   = "pool"
    value = "a1-free"
  }

  # No ignore_changes on the image on purpose: every `terraform apply` moves the nodes to the newest
  # patched OKE image for this version (one node at a time, see node_pool_cycling_details).
}
