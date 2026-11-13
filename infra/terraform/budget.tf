# Always Free guard: an email the moment anything in the compartment costs money
# (e.g. a 3rd node, an Enhanced cluster, a bigger volume).
resource "oci_budget_budget" "free_tier_guard" {
  compartment_id = var.tenancy_ocid
  display_name   = "free-tier-guard"
  amount         = 1
  reset_period   = "MONTHLY"
  target_type    = "COMPARTMENT"
  targets        = [var.compartment_ocid]
}

resource "oci_budget_alert_rule" "any_spend" {
  budget_id      = oci_budget_budget.free_tier_guard.id
  display_name   = "any-spend"
  type           = "ACTUAL"
  threshold_type = "ABSOLUTE"
  threshold      = 0.01
  recipients     = var.budget_alert_email
  message        = "Something in the shop's OCI compartment is costing money – check Cost Analysis."
}

resource "oci_budget_alert_rule" "forecast" {
  budget_id      = oci_budget_budget.free_tier_guard.id
  display_name   = "forecast-spend"
  type           = "FORECAST"
  threshold_type = "ABSOLUTE"
  threshold      = 1
  recipients     = var.budget_alert_email
  message        = "OCI forecasts spending for the shop this month – check Cost Analysis."
}
