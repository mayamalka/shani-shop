# Hosting runbook: Kubernetes on Oracle Cloud's Always Free tier

The shop runs on an **OKE Basic** cluster with two Ampere A1 nodes. Deploys are GitOps with **Argo CD**.

| What it costs | |
|---|---|
| Kubernetes control plane (OKE *Basic*) | free |
| 2 worker nodes, VM.Standard.A1.Flex, 1 OCPU / 6 GB each | free (the whole A1 allowance: 2 OCPU / 12 GB) |
| Block storage: 2 × 50 GB boot + 50 GB database | free (200 GB allowance) |
| Network Load Balancer, reserved IP, NAT/service gateways | free |
| Cloudflare DNS + proxy + R2 (10 GB) | free |
| GitHub Actions + GHCR, Renovate, UptimeRobot | free |
| **The domain** | about ₪60–100 a year |

A $1 OCI budget alert emails you if anything ever starts costing money (`infra/terraform/budget.tf`).

```
Browser ─► Cloudflare (proxy, TLS, cache) ─► OCI Network Load Balancer ─► Traefik (Gateway API)
                                                              ├─ /api/*, /media/* ─► api  (2 pods, Fastify)
                                                              └─ /*               ─► web  (2 pods, nginx + React build)
api ─► CloudNativePG "shani-db" ──WAL + nightly base backups──► R2 bucket shani-db-backups
api ─► R2 bucket shani-media (product pictures + private customer photos)
Job migrate (every Argo CD sync) · CronJob purge-photos (every 6 h)
```

## Repository layout

| Path | What |
|---|---|
| `infra/terraform/` | OCI network, OKE cluster and node pool, reserved IP, budget. Cloudflare DNS, R2 buckets, TLS settings |
| `deploy/docker/` | `api.Dockerfile`, `web.Dockerfile`, and the nginx config. The nginx security headers must match helmet; `apps/api/test/headers.test.ts` checks this |
| `deploy/k8s/argocd/` | `root.yaml` (applied once by hand), `apps/` (app-of-apps: one Application per component), `values/argo-cd.yaml` |
| `deploy/k8s/gateway-api-crds/` | Gateway API CRDs v1.6.3 (the version Traefik 3.7 is built against) |
| `deploy/k8s/platform/` | Let's Encrypt ClusterIssuer (DNS-01 through Cloudflare), the certificate, the Gateway, the http→https and www→apex redirects |
| `deploy/k8s/app/base/` | The shop: api, web, database, migrate Job, purge CronJob, HTTPRoute |
| `deploy/k8s/app/prod/` | Domain-specific values (`site.yaml`), image tags (bumped by CI), and `sealed/` (encrypted secrets) |
| `.github/workflows/release.yml` | Runs after CI passes on `main`. It builds the arm64 images, pushes them to GHCR, and commits the new tags into `app/prod` |

Sync order (Argo CD waves): Argo CD (-5) → Gateway API CRDs (-4) → sealed-secrets, cert-manager, CloudNativePG (-3) → barman-cloud plugin, Traefik (-2) → platform (-1) → secrets (0) → shop (1).
Inside the shop app the order is: database (0) → migrate Job (1) → api and web (2).

## Placeholders to replace before the first deploy

Replace them all with one search across `deploy/` (`git grep -n -e OWNER -e shop.example.com -e ACCOUNT_ID -e RESERVED_PUBLIC_IP deploy`):

| Placeholder | Replace with | Files |
|---|---|---|
| `OWNER` | your GitHub user or org in **lower case** (the repo is `OWNER/shani-shop`) | `deploy/k8s/argocd/**`, `app/prod/kustomization.yaml` (CI also sets it on the first release) |
| `shop.example.com` | the shop's domain | `app/base/routes.yaml`, `app/base/config.yaml`, `app/prod/site.yaml`, `platform/*.yaml` |
| `ACCOUNT_ID` | your Cloudflare account ID (`terraform output r2_endpoint`) | `app/base/*.yaml`, `app/prod/site.yaml` |
| `RESERVED_PUBLIC_IP` | `terraform output public_ip` | `argocd/apps/20-traefik.yaml` |
| `admin@shop.example.com` | the email that gets Let's Encrypt expiry warnings | `platform/cluster-issuer.yaml` |

## First-time setup (about two hours, once)

### 1. Accounts
- **Oracle Cloud:** sign up and pick the **home region** carefully. Always Free resources exist only there, and it can't be changed. Prefer `il-jerusalem-1` (data stays in Israel), otherwise `eu-frankfurt-1`.
  Then **upgrade to Pay As You Go**. Always Free resources stay free, and Oracle stops reclaiming "idle" free instances.
- **Cloudflare:** add the domain (free plan) and point the registrar's nameservers to Cloudflare. Enable R2 (free tier).
- **GitHub:** push the repo and install the [Renovate app](https://github.com/apps/renovate) on it.

### 2. Infrastructure (Terraform)
```bash
cd infra/terraform
cp backend.hcl.example backend.hcl            # create the state bucket first (commands inside)
cp terraform.tfvars.example terraform.tfvars  # fill in
export TF_VAR_cloudflare_api_token=...        # Zone:DNS:Edit, Zone Settings:Edit, Account:R2 Storage:Edit
terraform init -backend-config=backend.hcl
terraform apply
$(terraform output -raw kubeconfig_command)   # kubectl now talks to the cluster
```
If the node pool fails with **"Out of host capacity"**, that's A1 demand in the region. Run `terraform apply` again later; it often takes a few tries.

### 3. Replace the placeholders, then push to `main`
CI runs. When it passes, `release.yml` builds `ghcr.io/<owner>/shani-api` and `shani-web` and commits their tags.
After the first release, either make both GHCR packages **public** (GitHub → Packages → Package settings; the images contain no secrets), or set `GHCR_USER`/`GHCR_TOKEN` in step 5.

### 4. Install Argo CD and hand control to Git
```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm install argocd argo/argo-cd --version 10.11.6 -n argocd --create-namespace -f deploy/k8s/argocd/values/argo-cd.yaml
# private repo only – read-only deploy key (GitHub → Settings → Deploy keys):
#   kubectl -n argocd create secret generic repo-shani --from-literal=type=git \
#     --from-literal=url=git@github.com:OWNER/shani-shop.git --from-file=sshPrivateKey=deploy_key
#   kubectl -n argocd label secret repo-shani argocd.argoproj.io/secret-type=repository
#   (and use the git@github.com:… URL in deploy/k8s/argocd/**)
kubectl apply -n argocd -f deploy/k8s/argocd/root.yaml
kubectl -n argocd port-forward svc/argocd-server 8080:80   # UI: http://localhost:8080
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
```
The platform installs itself. The `shop` app waits for its secrets.

### 5. Secrets
Create these first:
- **Two R2 API tokens** (Cloudflare → R2 → Manage API tokens → "Object Read & Write"): one limited to `shani-media`, one to `shani-db-backups`.
- **A DNS token** for cert-manager (Zone → DNS → Edit).
- **The SMTP login** of the email service, e.g. Brevo (free, 300 emails a day). Add the SPF/DKIM records it shows you in Cloudflare.

```bash
cp deploy/k8s/secrets.env.example deploy/k8s/secrets.env   # fill in – git-ignored
deploy/k8s/seal-secrets.sh                                 # needs kubeseal: https://github.com/bitnami/sealed-secrets/releases
git add deploy/k8s/app/prod/sealed && git commit -m "Add sealed secrets" && git push
```

### 6. Starter data and the admin
```bash
kubectl -n shani exec deploy/api -- node apps/api/dist/seed.js                       # once: products, pages, settings
kubectl -n shani exec -it deploy/api -- node apps/api/dist/create-admin.js --email shani@…  # QR code + backup codes
```

### 7. Back up the secrets to a password manager
These files exist only on your PC (all git-ignored). If the PC is lost and they are not backed up, you can't change a secret, rebuild the cluster, or decrypt the admin's 2FA. Store each one as a **secure note** (paste the file's text; every password manager supports this, file attachments are often a paid feature).

| Secure note | What to paste | Why it matters |
|---|---|---|
| `shani – secrets.env` | the whole `deploy/k8s/secrets.env` | **APP_SECRET** decrypts the admin's authenticator; the rest are the R2, DNS and SMTP keys |
| `shani – sealed-secrets key` | output of the command below | without it, the files in `app/prod/sealed/` can't be decrypted on a new cluster |
| `shani – terraform` | `infra/terraform/terraform.tfvars` + `infra/terraform/backend.hcl` | inputs for every `terraform plan/apply` |
| `shani – Cloudflare terraform token` | the `terraform-shani` API token | Cloudflare shows it only once |
| `shani – OCI API key` | `~/.oci/config` + `~/.oci/oci_api_key.pem` | Terraform and kubectl log in to Oracle with it (or create a new key in the console instead) |
| `shani – admin backup codes` | the 10 codes `create-admin.js` prints (step 6) | the admin's way in if their phone is lost – give these to the admin |

Steps:
1. Export the sealed-secrets key (it changes only if the controller is reinstalled) and paste it into the note:
   ```bash
   kubectl -n kube-system get secret -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml > sealed-secrets-key.yaml
   ```
2. Create the notes in the table, then **delete the exported key file**: `rm sealed-secrets-key.yaml` (it can decrypt every sealed secret).
3. Update the note every time you change the file behind it (a new secret in `secrets.env`, a new IP in `terraform.tfvars`, a rotated token).
4. Share the vault entries with the owner (Shani), so access doesn't depend on one person.

Restoring on a new cluster: install sealed-secrets first, then before Argo CD syncs the `secrets` app:
```bash
kubectl apply -f sealed-secrets-key.yaml        # recreated from the note
kubectl -n kube-system delete pod -l app.kubernetes.io/name=sealed-secrets   # the controller reloads the keys
```

### 8. Monitoring and automatic checks
- [UptimeRobot](https://uptimerobot.com) (free): a keyword monitor on `https://<domain>/api/health` (keyword `ok`), plus one on `https://<domain>/`.
- **Restore drill alerts:** create a check on [healthchecks.io](https://healthchecks.io) (free) with period 31 days and grace 2 days. Put its ping URL in `RESTORE_DRILL_PING_URL` in `secrets.env`, then re-run `seal-secrets.sh`.
- **Kubernetes version check:** create a read-only OCI user for GitHub Actions.
  1. In the OCI console, go to Identity: create the user `github-k8s-check`, a group `oke-readers` containing it, and the policy `Allow group oke-readers to read cluster-family in tenancy`.
  2. Give the user an API key.
  3. Add the repository secrets `OCI_CLI_USER`, `OCI_CLI_TENANCY`, `OCI_CLI_FINGERPRINT`, `OCI_CLI_KEY_CONTENT` (the private key PEM) and `OCI_CLI_REGION`.
  4. In GitHub → Settings → Actions → General, tick "Allow GitHub Actions to create and approve pull requests". Then run the workflow once by hand (Actions → Kubernetes version check → Run workflow).
- Optional: Grafana Cloud's free tier. Use its "Kubernetes monitoring" onboarding, which generates the Helm values, and add it as one more Application in `deploy/k8s/argocd/apps/`.

## Day-to-day

| Task | How |
|---|---|
| Deploy a change | Merge to `main`. CI → release → tag commit → Argo CD syncs (migrate Job, then a rolling update). |
| Dependency updates | **Patch** updates (npm, Node/nginx base images) merge themselves once CI passes. There's no PR or email unless CI fails, in which case Renovate opens a PR. **Minor/major** updates (npm minor, Helm charts, Postgres 17.x) arrive as PRs on Monday mornings, and GitHub emails you about each new PR (you watch your own repos by default). Renovate's "Dependency Dashboard" issue lists everything pending. |
| Kubernetes upgrade (about 3 times a year) | `.github/workflows/k8s-version.yml` checks OKE every Monday and opens a PR bumping `infra/terraform/kubernetes.auto.tfvars` (next patch, else next minor; the title warns if the current version is out of support). Merge it, then run `terraform apply`: the control plane first, then the nodes one at a time (`maximum_surge = 0`, so no paid 3rd node). Every apply also moves the nodes to the newest patched OKE image. |
| Restore drill | Automatic: the `restore-drill` CronJob runs on the 3rd of each month. It restores the R2 backups into a temporary database, compares it with the live one, deletes it, and pings healthchecks.io. A missing ping means an email to you. Run it on demand: `kubectl -n shani create job --from=cronjob/restore-drill drill-now`. |
| Logs | `kubectl -n shani logs deploy/api -f` · `kubectl -n shani logs job/migrate` |
| Backups | `kubectl -n shani get backups` (nightly at 01:30 UTC) · WAL is archived continuously · 30-day point-in-time window |
| Change a secret | Edit `secrets.env`, run `seal-secrets.sh`, commit, then `kubectl -n shani rollout restart deploy/api` |
| Rollback | `git revert` the `deploy: …` commit (or any commit) and push |

### Manual restore (what the drill automates, and the real-disaster procedure)
Create a scratch cluster from the R2 backups, then check the orders are there:
```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata: { name: shani-db-restore, namespace: shani }
spec:
  instances: 1
  imageName: ghcr.io/cloudnative-pg/postgresql:17.10-standard-trixie  # same as shani-db
  storage: { size: 50Gi }  # this uses the last 50 GB of the free block storage – delete it after the drill
  bootstrap:
    recovery:
      source: origin
      # recoveryTarget: { targetTime: "2026-11-13 10:00:00+02" }   # point-in-time
  externalClusters:
    - name: origin
      plugin:
        name: barman-cloud.cloudnative-pg.io
        parameters: { barmanObjectName: r2-backups, serverName: shani-db }
```
```bash
kubectl -n shani exec -it shani-db-restore-1 -- psql -U postgres shani -c "select count(*) from orders"
kubectl -n shani delete cluster shani-db-restore
```
For a real disaster, restore under the name `shani-db` instead, after removing the broken cluster. The API reconnects by itself.

## Things to know
- **Rate limits are per API pod.** `@fastify/rate-limit` keeps counts in memory, so with 2 replicas each limit is effectively doubled. Admin login lockout lives in the database and is unaffected.
- **There are no NetworkPolicies.** OKE's flannel CNI doesn't enforce them, and adding Calico would mean more upkeep. Network isolation comes from the VCN instead: workers sit in a private subnet, only Cloudflare can reach the load balancer, and only `admin_cidrs` can reach the Kubernetes API.
- **Cloudflare's IP list** appears twice. Terraform reads it live for the security lists. The Traefik values hard-code it to trust `X-Forwarded-For`; check it against <https://www.cloudflare.com/ips/> about once a year.
- **Gateway API CRDs** (`deploy/k8s/gateway-api-crds`) should move with Traefik. Renovate bumps Traefik; check its release notes for the Gateway API version.
- **Free-tier facts (2026):** Oracle cut A1 to 2 OCPU / 12 GB in total. Never add a third node or change the cluster type to *Enhanced*; the budget alert will tell you if something starts costing money.
- **Fallback host:** if OKE capacity never shows up, the same `deploy/k8s` manifests run on k3s, for example on 2 Hetzner CAX11 servers (about €8 a month). Swap Traefik's OCI service annotations for k3s's ServiceLB.
