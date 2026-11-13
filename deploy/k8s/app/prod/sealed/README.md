# Sealed secrets

`deploy/k8s/seal-secrets.sh` writes the encrypted secrets here: `api-secrets.yaml`, `r2-backup-credentials.yaml`, `cloudflare-api-token.yaml` and, optionally, `ghcr-pull.yaml`.
Committing them is safe, because only the sealed-secrets controller in the cluster can decrypt them.
The Argo CD app `shop-secrets` syncs every `*.yaml` in this folder.
