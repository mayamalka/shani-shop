#!/usr/bin/env bash
# Encrypts the shop's secrets into SealedSecrets (safe to commit) under deploy/k8s/app/prod/sealed/.
# Only the sealed-secrets controller in the cluster can decrypt them.
#
#   cp deploy/k8s/secrets.env.example deploy/k8s/secrets.env   # fill it in – the file is git-ignored
#   deploy/k8s/seal-secrets.sh                                 # needs kubectl (pointing at the cluster) + kubeseal
#   git add deploy/k8s/app/prod/sealed && git commit -m "Update sealed secrets" && git push
#
# Re-run after changing any value; Argo CD rolls the change out (restart the API to pick it up:
#   kubectl -n shani rollout restart deploy/api).
set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE=${1:-secrets.env}
[[ -f $ENV_FILE ]] || { echo "Missing $ENV_FILE – copy secrets.env.example and fill it in." >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "./$ENV_FILE"
set +a

need() { for v in "$@"; do [[ -n ${!v:-} ]] || { echo "$v is empty in $ENV_FILE" >&2; exit 1; }; done; }
need APP_SECRET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY CLOUDFLARE_DNS_API_TOKEN
[[ ${#APP_SECRET} -ge 64 ]] || { echo "APP_SECRET must be 64 hex characters" >&2; exit 1; }

OUT=app/prod/sealed
mkdir -p "$OUT"

# seal <namespace> <output file> <kubectl create secret args...>
seal() {
  local ns=$1 file=$2
  shift 2
  kubectl create secret "$@" --namespace "$ns" --dry-run=client -o yaml |
    kubeseal --format yaml --controller-namespace kube-system --controller-name sealed-secrets-controller >"$OUT/$file"
  echo "sealed → $OUT/$file"
}

seal shani api-secrets.yaml generic api-secrets \
  --from-literal=APP_SECRET="$APP_SECRET" \
  --from-literal=S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  --from-literal=S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  --from-literal=SMTP_USER="${SMTP_USER:-}" \
  --from-literal=SMTP_PASS="${SMTP_PASS:-}"

seal shani r2-backup-credentials.yaml generic r2-backup-credentials \
  --from-literal=ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
  --from-literal=ACCESS_SECRET_KEY="$R2_BACKUP_SECRET_ACCESS_KEY"

seal cert-manager cloudflare-api-token.yaml generic cloudflare-api-token \
  --from-literal=api-token="$CLOUDFLARE_DNS_API_TOKEN"

if [[ -n ${RESTORE_DRILL_PING_URL:-} ]]; then
  seal shani restore-drill.yaml generic restore-drill --from-literal=PING_URL="$RESTORE_DRILL_PING_URL"
else
  rm -f "$OUT/restore-drill.yaml"
  echo "RESTORE_DRILL_PING_URL not set → the monthly restore drill can't alert you"
fi

if [[ -n ${GHCR_USER:-} && -n ${GHCR_TOKEN:-} ]]; then
  seal shani ghcr-pull.yaml docker-registry ghcr-pull \
    --docker-server=ghcr.io --docker-username="$GHCR_USER" --docker-password="$GHCR_TOKEN"
else
  rm -f "$OUT/ghcr-pull.yaml"
  echo "GHCR_USER/GHCR_TOKEN not set → no pull secret (fine when the GHCR packages are public)"
fi
