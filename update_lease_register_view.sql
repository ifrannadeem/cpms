-- ============================================================
-- Migration: Add unit_type and unit_name to v_lease_register
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
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
    -- Days to expiry (NULL for periodic / no expiry)
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
    l.notes,
    -- New columns added at end (CREATE OR REPLACE requires new cols at end)
    STRING_AGG(u.unit_type::TEXT, ', ' ORDER BY u.unit_reference) AS unit_types
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
