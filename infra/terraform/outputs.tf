output "kubeconfig_command" {
  description = "Run once to point kubectl at the cluster."
  value       = "oci ce cluster create-kubeconfig --cluster-id ${oci_containerengine_cluster.main.id} --region ${var.region} --token-version 2.0.0 --kube-endpoint PUBLIC_ENDPOINT --file $HOME/.kube/config"
}

output "public_ip" {
  description = "Reserved IP of the load balancer → replace RESERVED_PUBLIC_IP in deploy/k8s/argocd/apps/20-traefik.yaml."
  value       = oci_core_public_ip.lb.ip_address
}

output "r2_endpoint" {
  description = "Replace ACCOUNT_ID.r2.cloudflarestorage.com in deploy/k8s with this host."
  value       = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com"
}

output "node_image" {
  value = local.node_image_id
}
