-- ============================================================
-- COMMERCIAL PORTFOLIO OPERATING SYSTEM
-- Stage 2: Lease Event Engine
-- ============================================================
-- Deploys:
--   1. fn_calculate_lease_state()   — pure function: correct state from dates
--   2. fn_refresh_lease_states()    — bulk-updates all lease states
--   3. v_lease_alerts               — all pending alerts across all leases
--   4. v_dashboard_critical         — action required ≤ 30 days
--   5. v_dashboard_review           — attention required 31–180 days
--   6. v_portfolio_health           — per-asset summary for header tiles
-- ============================================================
-- Run AFTER schema.sql and seed.sql
-- ============================================================


-- ============================================================
-- 1. STATE CALCULATION FUNCTION
-- Pure logic: given dates → correct lease_state enum value.
-- Priority order (highest wins):
--   TERMINATED > PERIODIC > APPROACHING_EXPIRY > ACTIVE
-- Note: APPROACHING_REVIEW is surfaced as an alert event but
-- APPROACHING_EXPIRY takes precedence as the stored state.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_calculate_lease_state(
    p_current_state  lease_state_enum,
    p_expiry_date    DATE,
    p_annual_rent    NUMERIC
) RETURNS lease_state_enum
LANGUAGE plpgsql STABLE AS $$
BEGIN
    -- TERMINATED is manual-only — never overwritten by engine
    IF p_current_state = 'TERMINATED' THEN
        RETURN 'TERMINATED';
    END IF;

    -- £0 rent / no expiry (internal use, licences) — stay ACTIVE
    IF p_expiry_date IS NULL THEN
        RETURN 'ACTIVE';
    END IF;

    -- Past expiry → held over as PERIODIC
    IF p_expiry_date < CURRENT_DATE THEN
        RETURN 'PERIODIC';
    END IF;

    -- Within 12 months of expiry → approaching
    IF p_expiry_date <= CURRENT_DATE + INTERVAL '12 months' THEN
        RETURN 'APPROACHING_EXPIRY';
    END IF;

    RETURN 'ACTIVE';
END;
$$;


-- ============================================================
-- 2. BULK STATE REFRESH FUNCTION
-- Call this daily (pg_cron or Supabase scheduled function).
-- Only advances states — never reverts TERMINATED.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_refresh_lease_states()
RETURNS TABLE (
    lease_reference  TEXT,
    old_state        lease_state_enum,
    new_state        lease_state_enum
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH updates AS (
        UPDATE leases l
        SET    lease_state = fn_calculate_lease_state(
                                 l.lease_state,
                                 l.expiry_date,
                                 l.annual_rent
                             )
        WHERE  l.active = TRUE
          AND  l.lease_state <> 'TERMINATED'
          AND  l.lease_state <> fn_calculate_lease_state(
                                     l.lease_state,
                                     l.expiry_date,
                                     l.annual_rent
                                 )
        RETURNING l.lease_reference,
                  l.lease_state AS new_state
    )
    -- Note: RETURNING gives new value; join to get old would need CTE before update.
    -- Simplified: return all changed records with their new state.
    SELECT u.lease_reference, NULL::lease_state_enum, u.new_state
    FROM   updates u;
END;
$$;


-- ============================================================
-- 3. MASTER ALERTS VIEW
-- One row per alert per lease. Covers:
--   • Lease expiry (18m / 12m / 6m / 3m thresholds)
--   • Rent review (12m / 6m / 3m thresholds)
--   • Break clause (12m / 6m / 3m thresholds)
--   • Periodic tenancy — immediate + review prompt
--   • Rent-free period expiry (3m / 1m thresholds)
--   • Rent incentive end date (3m / 1m thresholds)  ← from rent_incentives
-- ============================================================
CREATE OR REPLACE VIEW v_lease_alerts AS

-- ── A: Lease Expiry Alerts ────────────────────────────────────
SELECT
    l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name                                AS tenant_name,
    a.asset_name,
    'LEASE_EXPIRY'::TEXT                        AS alert_type,
    l.expiry_date                               AS event_date,
    (l.expiry_date - CURRENT_DATE)::INT         AS days_until,
    CASE
        WHEN (l.expiry_date - CURRENT_DATE) <= 90  THEN 'CRITICAL'
        WHEN (l.expiry_date - CURRENT_DATE) <= 180 THEN 'HIGH'
        WHEN (l.expiry_date - CURRENT_DATE) <= 365 THEN 'MEDIUM'
        ELSE                                             'LOW'
    END                                         AS urgency,
    'Engage tenant on renewal or begin void planning.' AS action_required,
    l.notes
FROM   leases      l
JOIN   tenants     t ON t.tenant_id   = l.tenant_id
JOIN   assets      a ON a.asset_id    = l.asset_id
WHERE  l.active    = TRUE
  AND  l.lease_state NOT IN ('TERMINATED', 'PERIODIC')
  AND  l.expiry_date IS NOT NULL
  AND  l.expiry_date <= CURRENT_DATE + INTERVAL '18 months'

UNION ALL

-- ── B: Periodic Tenancy — Immediate Alert ───────────────────
SELECT
    l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name,
    a.asset_name,
    'PERIODIC_TENANCY'::TEXT,
    l.expiry_date,
    (CURRENT_DATE - COALESCE(l.expiry_date, CURRENT_DATE))::INT * -1,
    'CRITICAL',
    'Formalise new lease or make commercial decision. Unmanaged periodic tenancies create legal exposure.',
    l.notes
FROM   leases  l
JOIN   tenants t ON t.tenant_id = l.tenant_id
JOIN   assets  a ON a.asset_id  = l.asset_id
WHERE  l.active      = TRUE
  AND  l.lease_state = 'PERIODIC'
  AND  l.annual_rent > 0   -- exclude internal/licence records

UNION ALL

-- ── C: Rent Review Alerts ────────────────────────────────────
SELECT
    l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name,
    a.asset_name,
    'RENT_REVIEW'::TEXT,
    l.next_rent_review_date,
    (l.next_rent_review_date - CURRENT_DATE)::INT,
    CASE
        WHEN (l.next_rent_review_date - CURRENT_DATE) <= 90  THEN 'CRITICAL'
        WHEN (l.next_rent_review_date - CURRENT_DATE) <= 180 THEN 'HIGH'
        ELSE                                                       'MEDIUM'
    END,
    'Initiate rent review. Instruct surveyor if open market review.',
    l.notes
FROM   leases  l
JOIN   tenants t ON t.tenant_id = l.tenant_id
JOIN   assets  a ON a.asset_id  = l.asset_id
WHERE  l.active                = TRUE
  AND  l.lease_state          <> 'TERMINATED'
  AND  l.next_rent_review_date IS NOT NULL
  AND  l.next_rent_review_date <= CURRENT_DATE + INTERVAL '12 months'
  AND  l.next_rent_review_date >  CURRENT_DATE

UNION ALL

-- ── D: Break Clause Alerts ───────────────────────────────────
SELECT
    l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name,
    a.asset_name,
    'BREAK_CLAUSE'::TEXT,
    l.break_clause_date,
    (l.break_clause_date - CURRENT_DATE)::INT,
    CASE
        WHEN (l.break_clause_date - CURRENT_DATE) <= 90  THEN 'CRITICAL'
        WHEN (l.break_clause_date - CURRENT_DATE) <= 180 THEN 'HIGH'
        ELSE                                                   'MEDIUM'
    END,
    COALESCE(
        'Break clause: ' || l.break_clause_party::TEXT || '. ' || l.break_clause_notes,
        'Break clause approaching. Review strategic options.'
    ),
    l.notes
FROM   leases  l
JOIN   tenants t ON t.tenant_id = l.tenant_id
JOIN   assets  a ON a.asset_id  = l.asset_id
WHERE  l.active            = TRUE
  AND  l.lease_state      <> 'TERMINATED'
  AND  l.break_clause_date IS NOT NULL
  AND  l.break_clause_date <= CURRENT_DATE + INTERVAL '12 months'
  AND  l.break_clause_date >  CURRENT_DATE

UNION ALL

-- ── E: Rent-Free Period Expiry ───────────────────────────────
SELECT
    l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name,
    a.asset_name,
    'RENT_FREE_EXPIRY'::TEXT,
    l.rent_free_end_date,
    (l.rent_free_end_date - CURRENT_DATE)::INT,
    CASE
        WHEN (l.rent_free_end_date - CURRENT_DATE) <= 30 THEN 'CRITICAL'
        ELSE                                                   'HIGH'
    END,
    'Confirm billing engine switches to full rent from this date.',
    l.notes
FROM   leases  l
JOIN   tenants t ON t.tenant_id = l.tenant_id
JOIN   assets  a ON a.asset_id  = l.asset_id
WHERE  l.active            = TRUE
  AND  l.lease_state      <> 'TERMINATED'
  AND  l.rent_free_end_date IS NOT NULL
  AND  l.rent_free_end_date <= CURRENT_DATE + INTERVAL '3 months'
  AND  l.rent_free_end_date >  CURRENT_DATE

UNION ALL

-- ── F: Rent Incentive End Date ───────────────────────────────
SELECT
    l.lease_id,
    l.lease_reference,
    l.lease_state,
    t.legal_name,
    a.asset_name,
    'INCENTIVE_EXPIRY'::TEXT,
    ri.incentive_end_date,
    (ri.incentive_end_date - CURRENT_DATE)::INT,
    CASE
        WHEN (ri.incentive_end_date - CURRENT_DATE) <= 30 THEN 'CRITICAL'
        ELSE                                                    'HIGH'
    END,
    'Billing reverts to headline rent. Confirm charge profile is updated.',
    ri.notes
FROM   rent_incentives ri
JOIN   leases          l  ON l.lease_id   = ri.lease_id
JOIN   tenants         t  ON t.tenant_id  = l.tenant_id
JOIN   assets          a  ON a.asset_id   = l.asset_id
WHERE  ri.active            = TRUE
  AND  l.active             = TRUE
  AND  ri.incentive_end_date IS NOT NULL
  AND  ri.incentive_end_date <= CURRENT_DATE + INTERVAL '3 months'
  AND  ri.incentive_end_date >= CURRENT_DATE;


-- ============================================================
-- 4. DASHBOARD — CRITICAL ZONE
-- Action required now or within 30 days.
-- Includes: all PERIODIC tenancies, anything expiring ≤ 30 days,
-- any incentive ending ≤ 30 days.
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_critical AS
SELECT
    alert_type,
    urgency,
    lease_reference,
    tenant_name,
    asset_name,
    event_date,
    days_until,
    action_required,
    notes
FROM   v_lease_alerts
WHERE  urgency    = 'CRITICAL'
    OR lease_state = 'PERIODIC'
ORDER BY
    CASE urgency
        WHEN 'CRITICAL' THEN 1
        ELSE                 2
    END,
    days_until ASC NULLS LAST;


-- ============================================================
-- 5. DASHBOARD — REVIEW ZONE
-- Attention required within 31–180 days.
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_review AS
SELECT
    alert_type,
    urgency,
    lease_reference,
    tenant_name,
    asset_name,
    event_date,
    days_until,
    action_required,
    notes
FROM   v_lease_alerts
WHERE  urgency IN ('HIGH', 'MEDIUM')
  AND  (lease_state <> 'PERIODIC' OR alert_type <> 'PERIODIC_TENANCY')
ORDER BY
    CASE urgency
        WHEN 'HIGH'   THEN 1
        WHEN 'MEDIUM' THEN 2
        ELSE               3
    END,
    days_until ASC;


-- ============================================================
-- 6. PORTFOLIO HEALTH VIEW
-- One row per asset — header tile data for the dashboard.
-- ============================================================
CREATE OR REPLACE VIEW v_portfolio_health AS
SELECT
    a.asset_id,
    a.asset_name,
    a.asset_reference,
    -- Occupancy
    COUNT(DISTINCT u.unit_id)                                            AS total_units,
    COUNT(DISTINCT CASE WHEN u.unit_state = 'OCCUPIED' THEN u.unit_id END) AS occupied_units,
    COUNT(DISTINCT CASE WHEN u.unit_state = 'VACANT'   THEN u.unit_id END) AS vacant_units,
    -- Lease health
    COUNT(DISTINCT CASE WHEN l.lease_state = 'ACTIVE'             THEN l.lease_id END) AS active_leases,
    COUNT(DISTINCT CASE WHEN l.lease_state = 'PERIODIC'           THEN l.lease_id END) AS periodic_leases,
    COUNT(DISTINCT CASE WHEN l.lease_state = 'APPROACHING_EXPIRY' THEN l.lease_id END) AS approaching_expiry,
    -- Rent roll (headline annual)
    COALESCE(SUM(CASE WHEN l.active = TRUE AND l.lease_state <> 'TERMINATED'
                      THEN l.annual_rent END), 0)                        AS total_annual_rent,
    -- Critical alerts count
    COUNT(DISTINCT al.lease_reference)                                   AS critical_alert_count
FROM       assets            a
LEFT JOIN  units             u  ON u.asset_id   = a.asset_id  AND u.active = TRUE
LEFT JOIN  lease_units       lu ON lu.unit_id   = u.unit_id
LEFT JOIN  leases            l  ON l.lease_id   = lu.lease_id AND l.active = TRUE
LEFT JOIN  v_dashboard_critical al ON al.lease_reference = l.lease_reference
WHERE a.active = TRUE
GROUP BY a.asset_id, a.asset_name, a.asset_reference
ORDER BY a.asset_name;


-- ============================================================
-- 7. FULL LEASE REGISTER VIEW
-- Complete operational view of every active lease with
-- its current alert status — used by the lease register page.
-- ============================================================
CREATE OR REPLACE VIEW v_lease_register AS
SELECT
    l.lease_id,
    l.lease_reference,
    l.lease_type,
    l.lease_state,
    a.asset_name,
    a.asset_reference,
    t.legal_name                                                AS tenant_name,
    t.trading_name,
    -- Linked units (aggregated)
    STRING_AGG(u.unit_reference, ', ' ORDER BY u.unit_reference) AS unit_references,
    -- Key dates
    l.commencement_date,
    l.expiry_date,
    l.next_rent_review_date,
    l.break_clause_date,
    l.rent_free_end_date,
    -- Financials
    l.annual_rent,
    l.billing_frequency,
    -- Days to expiry (NULL for periodic/no expiry)
    CASE
        WHEN l.expiry_date IS NOT NULL AND l.expiry_date >= CURRENT_DATE
        THEN (l.expiry_date - CURRENT_DATE)::INT
        ELSE NULL
    END                                                         AS days_to_expiry,
    -- Alert status (highest urgency active alert)
    (
        SELECT MIN(CASE urgency
                   WHEN 'CRITICAL' THEN 1
                   WHEN 'HIGH'     THEN 2
                   WHEN 'MEDIUM'   THEN 3
                   WHEN 'LOW'      THEN 4 END)
        FROM   v_lease_alerts al
        WHERE  al.lease_id = l.lease_id
    )                                                           AS alert_priority,
    (
        SELECT STRING_AGG(DISTINCT al.alert_type, ', ')
        FROM   v_lease_alerts al
        WHERE  al.lease_id = l.lease_id
    )                                                           AS active_alert_types,
    l.notes
FROM       leases      l
JOIN       tenants     t  ON t.tenant_id  = l.tenant_id
JOIN       assets      a  ON a.asset_id   = l.asset_id
LEFT JOIN  lease_units lu ON lu.lease_id  = l.lease_id
LEFT JOIN  units       u  ON u.unit_id    = lu.unit_id AND u.active = TRUE
WHERE      l.active = TRUE
  AND      l.lease_state <> 'TERMINATED'
GROUP BY
    l.lease_id, l.lease_reference, l.lease_type, l.lease_state,
    a.asset_name, a.asset_reference,
    t.legal_name, t.trading_name,
    l.commencement_date, l.expiry_date, l.next_rent_review_date,
    l.break_clause_date, l.rent_free_end_date,
    l.annual_rent, l.billing_frequency, l.notes
ORDER BY
    a.asset_name, l.lease_reference;


-- ============================================================
-- 8. INITIAL STATE REFRESH
-- Run once now to set all lease states correctly from seed data.
-- After this, schedule fn_refresh_lease_states() to run daily.
-- ============================================================
UPDATE leases
SET    lease_state = fn_calculate_lease_state(
                        lease_state,
                        expiry_date,
                        annual_rent
                    )
WHERE  active      = TRUE
  AND  lease_state <> 'TERMINATED';

-- ============================================================
-- 9. VERIFICATION QUERIES
-- Run these after deployment to confirm the engine is working.
-- ============================================================

-- State distribution after refresh
-- SELECT lease_state, COUNT(*) FROM leases GROUP BY lease_state ORDER BY COUNT(*) DESC;

-- Critical dashboard — should show PTP-11, all periodics, etc.
-- SELECT alert_type, urgency, lease_reference, tenant_name, event_date, days_until, action_required FROM v_dashboard_critical ORDER BY days_until;

-- Portfolio health tiles
-- SELECT asset_name, total_units, occupied_units, vacant_units, active_leases, periodic_leases, approaching_expiry, total_annual_rent, critical_alert_count FROM v_portfolio_health;

-- Full lease register
-- SELECT lease_reference, tenant_name, unit_references, lease_state, days_to_expiry, active_alert_types FROM v_lease_register ORDER BY asset_name, lease_reference;

