# The cluster's Kubernetes version. Committed so .github/workflows/k8s-version.yml can open a PR
# when Oracle offers a newer one. After merging that PR: terraform apply (see deploy/README.md).
# Pick the initial value from: oci ce cluster-options get --cluster-option-id all
kubernetes_version = "v1.37.0"
