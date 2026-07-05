-- Fix: v_portfolio_health multiplied annual_rent by the number of units on a lease.
-- The join assets -> units -> lease_units -> leases produces one row per unit, so a
-- lease covering 4 suites contributed its annual rent 4x to total_annual_rent
-- (dashboard "Rent Roll (Owned)" tile). Lease/unit COUNTs were already DISTINCT and correct.
--
-- The rent sum now deduplicates by lease over exactly the same lease set as before
-- (leases reached via active units of the asset), so the only change is removing
-- the double counting. All other columns are unchanged.

CREATE OR REPLACE VIEW public.v_portfolio_health AS
 SELECT a.asset_id,
    a.asset_name,
    a.asset_reference,
    count(DISTINCT u.unit_id) AS total_units,
    count(DISTINCT
        CASE
            WHEN u.unit_state = 'OCCUPIED'::unit_state_enum THEN u.unit_id
            ELSE NULL::uuid
        END) AS occupied_units,
    count(DISTINCT
        CASE
            WHEN u.unit_state = 'VACANT'::unit_state_enum THEN u.unit_id
            ELSE NULL::uuid
        END) AS vacant_units,
    count(DISTINCT
        CASE
            WHEN l.lease_state = 'ACTIVE'::lease_state_enum THEN l.lease_id
            ELSE NULL::uuid
        END) AS active_leases,
    count(DISTINCT
        CASE
            WHEN l.lease_state = 'PERIODIC'::lease_state_enum THEN l.lease_id
            ELSE NULL::uuid
        END) AS periodic_leases,
    count(DISTINCT
        CASE
            WHEN l.lease_state = 'APPROACHING_EXPIRY'::lease_state_enum THEN l.lease_id
            ELSE NULL::uuid
        END) AS approaching_expiry,
    COALESCE((
        SELECT sum(x.annual_rent)
        FROM (
            SELECT DISTINCT l3.lease_id, l3.annual_rent
            FROM units u3
            JOIN lease_units lu3 ON lu3.unit_id = u3.unit_id
            JOIN leases l3 ON l3.lease_id = lu3.lease_id
            WHERE u3.asset_id = a.asset_id
              AND u3.active = true
              AND l3.active = true
              AND l3.lease_state <> 'TERMINATED'::lease_state_enum
        ) x
    ), 0::numeric) AS total_annual_rent,
    count(DISTINCT al.lease_reference) AS critical_alert_count
   FROM assets a
     LEFT JOIN units u ON u.asset_id = a.asset_id AND u.active = true
     LEFT JOIN lease_units lu ON lu.unit_id = u.unit_id
     LEFT JOIN leases l ON l.lease_id = lu.lease_id AND l.active = true
     LEFT JOIN v_dashboard_critical al ON al.lease_reference = l.lease_reference
  WHERE a.active = true
  GROUP BY a.asset_id, a.asset_name, a.asset_reference
  ORDER BY a.asset_name;
