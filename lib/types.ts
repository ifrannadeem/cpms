export interface PortfolioHealth {
  asset_id: string
  asset_name: string
  asset_reference: string
  total_units: number
  occupied_units: number
  vacant_units: number
  active_leases: number
  periodic_leases: number
  approaching_expiry: number
  total_annual_rent: number
  critical_alert_count: number
}

export type AlertUrgency = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
export type AlertType =
  | "LEASE_EXPIRY"
  | "RENT_REVIEW"
  | "BREAK_CLAUSE"
  | "PERIODIC_TENANCY"
  | "RENT_FREE_EXPIRY"
  | "INCENTIVE_EXPIRY"

export interface LeaseAlert {
  alert_type: AlertType
  urgency: AlertUrgency
  lease_reference: string
  lease_state: string
  tenant_name: string
  asset_name: string
  event_date: string | null
  days_until: number | null
  action_required: string
  notes: string | null
}

export type LeaseState =
  | "ACTIVE"
  | "PERIODIC"
  | "APPROACHING_EXPIRY"
  | "APPROACHING_REVIEW"
  | "TERMINATED"

export interface LeaseRegisterEntry {
  lease_id: string
  lease_reference: string
  lease_type: string
  lease_state: LeaseState
  asset_name: string
  asset_reference: string
  tenant_name: string
  trading_name: string | null
  unit_references: string
  commencement_date: string | null
  expiry_date: string | null
  next_rent_review_date: string | null
  break_clause_date: string | null
  annual_rent: number
  billing_frequency: string
  days_to_expiry: number | null
  alert_priority: number | null
  active_alert_types: string | null
  notes: string | null
}
