-- ============================================================
-- COMMERCIAL PORTFOLIO OPERATING SYSTEM
-- Stage 1 — Entity Foundation Schema
-- Built from: Architecture Specification v1.0 + Data Specification v3.1
-- Database: Supabase (PostgreSQL)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- ENUMERATIONS
-- ============================================================

CREATE TYPE asset_type_enum AS ENUM (
  'RETAIL_PARK', 'RETAIL', 'OFFICE', 'MIXED_USE', 'INDUSTRIAL', 'OTHER'
);

CREATE TYPE unit_type_enum AS ENUM (
  'OFFICE', 'RETAIL', 'WORKSHOP', 'STORAGE', 'OTHER'
);

CREATE TYPE unit_state_enum AS ENUM (
  'OCCUPIED', 'VACANT', 'UNDER_OFFER'
);

CREATE TYPE lease_type_enum AS ENUM (
  'FIXED_TERM', 'PERIODIC', 'TENANCY_AT_WILL'
);

CREATE TYPE billing_frequency_enum AS ENUM (
  'MONTHLY', 'QUARTERLY', 'ANNUAL'
);

CREATE TYPE rent_review_basis_enum AS ENUM (
  'OPEN_MARKET', 'RPI', 'CPI', 'FIXED_UPLIFT', 'NONE'
);

CREATE TYPE break_clause_party_enum AS ENUM (
  'LANDLORD', 'TENANT', 'MUTUAL'
);

CREATE TYPE deposit_type_enum AS ENUM (
  'CASH', 'GUARANTEE', 'NONE'
);

CREATE TYPE repairing_obligation_enum AS ENUM (
  'FRI', 'IRI', 'SCHEDULE_OF_CONDITION', 'OTHER'
);

CREATE TYPE lease_state_enum AS ENUM (
  'ACTIVE', 'APPROACHING_REVIEW', 'APPROACHING_EXPIRY', 'PERIODIC', 'TERMINATED'
);

CREATE TYPE termination_reason_enum AS ENUM (
  'EXPIRY', 'SURRENDER', 'BREAK_LANDLORD', 'BREAK_TENANT', 'FORFEITURE'
);

CREATE TYPE tenant_type_enum AS ENUM (
  'COMPANY', 'INDIVIDUAL', 'PARTNERSHIP', 'OTHER'
);

CREATE TYPE tenant_state_enum AS ENUM (
  'STABLE', 'SLOW_PAYER', 'ARREARS_CONCERN'
);

-- VAT_DEFERRED added to support units where VAT has been opted-to-tax
-- but not yet charged (will apply on lease renewal). See data spec notes.
CREATE TYPE vat_treatment_enum AS ENUM (
  'STANDARD', 'EXEMPT', 'ZERO_RATED', 'OUTSIDE_SCOPE', 'VAT_DEFERRED'
);

CREATE TYPE charge_type_enum AS ENUM (
  'RENT', 'ELECTRIC', 'INSURANCE', 'WATER', 'SERVICE_CHARGE', 'CREDIT', 'OTHER'
);

CREATE TYPE calculation_method_enum AS ENUM (
  'FIXED', 'METER_BASED', 'APPORTIONED'
);

CREATE TYPE apportionment_basis_enum AS ENUM (
  'FLOOR_AREA', 'EQUAL_SHARE', 'CUSTOM'
);

CREATE TYPE charge_status_enum AS ENUM (
  'DRAFT', 'ISSUED', 'PAID', 'PART_PAID', 'OVERDUE', 'DISPUTED', 'WRITTEN_OFF', 'CREDITED'
);

CREATE TYPE generated_by_enum AS ENUM (
  'SYSTEM', 'MANUAL'
);

CREATE TYPE meter_type_enum AS ENUM (
  'ELECTRICITY', 'WATER', 'GAS'
);

CREATE TYPE utility_type_enum AS ENUM (
  'ELECTRICITY', 'WATER', 'GAS'
);

CREATE TYPE read_type_enum AS ENUM (
  'ACTUAL', 'ESTIMATED'
);

CREATE TYPE compliance_type_enum AS ENUM (
  'EPC', 'EICR', 'GAS_SAFETY', 'FIRE_RISK', 'ASBESTOS', 'LEGIONELLA',
  'HVAC', 'LIFT', 'INSURANCE', 'PAT', 'OTHER'
);

CREATE TYPE compliance_status_enum AS ENUM (
  'COMPLIANT', 'DUE_SOON', 'OVERDUE', 'NOT_APPLICABLE'
);

CREATE TYPE maintenance_category_enum AS ENUM (
  'REACTIVE', 'PLANNED', 'COMPLIANCE', 'VOID_WORKS', 'CAPITAL'
);

CREATE TYPE maintenance_priority_enum AS ENUM (
  'EMERGENCY', 'URGENT', 'ROUTINE', 'PLANNED'
);

CREATE TYPE maintenance_status_enum AS ENUM (
  'REPORTED', 'QUOTED', 'INSTRUCTED', 'IN_PROGRESS', 'COMPLETE', 'INVOICED'
);

CREATE TYPE event_category_enum AS ENUM (
  'FINANCIAL', 'LEASE', 'OPERATIONAL', 'TENANT', 'STRATEGIC', 'COMPLIANCE'
);

CREATE TYPE document_type_enum AS ENUM (
  'LEASE', 'COMPLIANCE_CERT', 'MAINTENANCE', 'CORRESPONDENCE',
  'BILLING', 'INSPECTION', 'OTHER'
);

CREATE TYPE file_format_enum AS ENUM (
  'PDF', 'DOCX', 'XLSX', 'JPG', 'OTHER'
);

-- Used in document_links and event_links junction tables
CREATE TYPE entity_type_enum AS ENUM (
  'PORTFOLIO', 'ASSET', 'BLOCK', 'UNIT', 'LEASE', 'TENANT',
  'CHARGE_RECORD', 'COMPLIANCE_RECORD', 'MAINTENANCE_EVENT',
  'SIGNIFICANT_EVENT', 'CONTRACTOR', 'METER', 'DOCUMENT'
);

CREATE TYPE incentive_type_enum AS ENUM (
  'RENT_FREE', 'FIXED_DISCOUNT', 'STEPPED_RENT'
);


-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- Applied to all tables that carry an updated_at column.
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- PHASE 1 — NO-DEPENDENCY TABLES
-- ============================================================

-- Document Templates
-- Stores letterhead templates linked to assets for document generation.
-- Phase 1: reference records only. Template content lives in OneDrive.
CREATE TABLE document_templates (
  template_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name      TEXT         NOT NULL,
  template_reference TEXT         NOT NULL UNIQUE,  -- e.g. 'RBC_Letterhead_v1'
  file_reference     TEXT,                          -- OneDrive path to template file
  notes              TEXT,
  active             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_document_templates_updated_at
  BEFORE UPDATE ON document_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Portfolios
-- Operational grouping of assets. income_owned separates owned vs managed
-- portfolios for financial reporting (Southgate = income_owned = false).
CREATE TABLE portfolios (
  portfolio_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_reference TEXT         NOT NULL UNIQUE,  -- e.g. 'PORT-001'
  portfolio_name      TEXT         NOT NULL,
  management_entity   TEXT         NOT NULL,
  ownership_entity    TEXT         NOT NULL,
  income_owned        BOOLEAN      NOT NULL DEFAULT TRUE,
  billing_currency    TEXT         NOT NULL DEFAULT 'GBP',
  active              BOOLEAN      NOT NULL DEFAULT TRUE,
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Tenants
-- Represents the legal occupying party. Never hard-deleted —
-- set active = false when all leases have ended.
CREATE TABLE tenants (
  tenant_id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name              TEXT               NOT NULL,
  trading_name            TEXT,
  company_number          TEXT,
  tenant_type             tenant_type_enum   NOT NULL,
  primary_contact_name    TEXT               NOT NULL,
  primary_contact_email   TEXT               NOT NULL,
  primary_contact_phone   TEXT,
  accounts_contact_name   TEXT,
  accounts_contact_email  TEXT               NOT NULL,
  correspondence_address  TEXT               NOT NULL,
  tenant_state            tenant_state_enum  NOT NULL DEFAULT 'STABLE',
  tenant_notes            TEXT,
  active                  BOOLEAN            NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Contractors
-- Trade contractors used for maintenance and compliance work.
-- Institutional memory — notes field captures operational observations.
CREATE TABLE contractors (
  contractor_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      TEXT         NOT NULL,
  trade             TEXT         NOT NULL,
  contact_name      TEXT         NOT NULL,
  contact_email     TEXT         NOT NULL,
  contact_phone     TEXT,
  insurance_expiry  DATE,
  gas_safe_number   TEXT,
  notes             TEXT,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_contractors_updated_at
  BEFORE UPDATE ON contractors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 2 — ASSETS (depends on portfolios, document_templates)
-- ============================================================

CREATE TABLE assets (
  asset_id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_reference        TEXT             NOT NULL UNIQUE,  -- e.g. 'ASSET-001'
  portfolio_id           UUID             NOT NULL REFERENCES portfolios(portfolio_id),
  asset_name             TEXT             NOT NULL,
  address_line_1         TEXT             NOT NULL,
  address_line_2         TEXT,
  town                   TEXT             NOT NULL,
  postcode               TEXT             NOT NULL,
  asset_type             asset_type_enum  NOT NULL,
  letterhead_template_id UUID             REFERENCES document_templates(template_id),
  ownership_entity       TEXT             NOT NULL,
  management_entity      TEXT             NOT NULL,
  acquisition_date       DATE,
  notes                  TEXT,
  active                 BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_portfolio_id ON assets(portfolio_id);

CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 3A — BLOCKS (depends on assets)
-- NOTE: utility_rate_id FK added via ALTER TABLE after utility_rates is created.
-- ============================================================

-- Blocks are optional — single-building assets have no block layer.
-- Utility rates differ per block (e.g. RBC Block A vs Block B have
-- separate contracted electricity rates and suppliers).
CREATE TABLE blocks (
  block_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID         NOT NULL REFERENCES assets(asset_id),
  block_name        TEXT         NOT NULL,
  block_reference   TEXT         NOT NULL,  -- e.g. 'RBC-A', 'RBC-B'
  -- utility_rate_id UUID added below after utility_rates exists
  notes             TEXT,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, block_reference)
);

CREATE INDEX idx_blocks_asset_id ON blocks(asset_id);

CREATE TRIGGER trg_blocks_updated_at
  BEFORE UPDATE ON blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 3B — UNITS (depends on assets, blocks)
-- NOTE: meter_id FK added via ALTER TABLE after meters is created.
-- ============================================================

-- Units are permanent physical objects — their unit_reference never changes.
-- Soft-deleted on permanent physical reconfiguration only.
-- Merges and splits tracked via merged_into_unit_id / split_from_unit_id self-refs.
CREATE TABLE units (
  unit_id                    UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id                   UUID             NOT NULL REFERENCES assets(asset_id),
  block_id                   UUID             REFERENCES blocks(block_id),
  unit_reference             TEXT             NOT NULL UNIQUE,  -- e.g. 'RBC-A-01', 'SRP-1.6'
  unit_type                  unit_type_enum   NOT NULL,
  floor_area_sqft            NUMERIC(10, 2),
  floor_area_sqm             NUMERIC(10, 2),
  floor_level                TEXT,
  -- meter_id UUID added below after meters exists
  unit_state                 unit_state_enum  NOT NULL DEFAULT 'VACANT',
  merged_into_unit_id        UUID             REFERENCES units(unit_id),  -- Permanent physical merge
  split_from_unit_id         UUID             REFERENCES units(unit_id),  -- Created from split
  vacancy_start_date         DATE,
  rateable_value             NUMERIC(12, 2),
  small_business_rate_relief BOOLEAN          NOT NULL DEFAULT FALSE,
  notes                      TEXT,
  active                     BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_units_asset_id   ON units(asset_id);
CREATE INDEX idx_units_block_id   ON units(block_id);
CREATE INDEX idx_units_unit_state ON units(unit_state);

CREATE TRIGGER trg_units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 4A — UTILITY RATES (depends on assets, blocks)
-- ============================================================

-- Time-bounded contracted electricity/utility rates per asset or block.
-- When a contracted rate changes, a NEW row is added — existing rows are
-- never edited. The billing engine uses the rate active on the read_date.
CREATE TABLE utility_rates (
  rate_id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_reference        TEXT               NOT NULL UNIQUE,  -- e.g. 'RATE-RBC-A-001'
  asset_id              UUID               NOT NULL REFERENCES assets(asset_id),
  block_id              UUID               REFERENCES blocks(block_id),  -- NULL = whole asset
  utility_type          utility_type_enum  NOT NULL,
  rate_per_kwh          NUMERIC(10, 4)     NOT NULL,
  standing_charge_daily NUMERIC(10, 4),    -- NULL = no standing charge
  effective_from        DATE               NOT NULL,
  effective_to          DATE,              -- NULL = currently active rate
  supplier_name         TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  -- At most one open-ended (current) rate per asset+block+utility combination
  CONSTRAINT unique_current_rate UNIQUE NULLS NOT DISTINCT (asset_id, block_id, utility_type, effective_to)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_utility_rates_asset_id   ON utility_rates(asset_id);
CREATE INDEX idx_utility_rates_block_id   ON utility_rates(block_id);
CREATE INDEX idx_utility_rates_effective  ON utility_rates(asset_id, utility_type, effective_from);

CREATE TRIGGER trg_utility_rates_updated_at
  BEFORE UPDATE ON utility_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Now add current utility rate reference to blocks
ALTER TABLE blocks
  ADD COLUMN utility_rate_id UUID REFERENCES utility_rates(rate_id);


-- ============================================================
-- PHASE 4B — METERS (depends on units, assets, blocks)
-- ============================================================

-- One meter per unit — no shared meters. Meter records persist when
-- decommissioned (active = false) to preserve read history.
CREATE TABLE meters (
  meter_id           UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id            UUID             NOT NULL REFERENCES units(unit_id),
  asset_id           UUID             NOT NULL REFERENCES assets(asset_id),
  block_id           UUID             REFERENCES blocks(block_id),
  meter_reference    TEXT             NOT NULL UNIQUE,
  meter_type         meter_type_enum  NOT NULL,
  installation_date  DATE,
  active             BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Enforce: one active meter per unit at any time
CREATE UNIQUE INDEX unique_active_meter_per_unit
  ON meters(unit_id)
  WHERE active = TRUE;

CREATE INDEX idx_meters_asset_id ON meters(asset_id);

CREATE TRIGGER trg_meters_updated_at
  BEFORE UPDATE ON meters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Now add meter reference to units
ALTER TABLE units
  ADD COLUMN meter_id UUID REFERENCES meters(meter_id);


-- ============================================================
-- PHASE 4C — LEASES (depends on tenants, assets)
-- NOTE: document_id FK added via ALTER TABLE after documents is created.
-- ============================================================

-- The most operationally important entity. Not merely a document record —
-- it is the economic instrument governing all charge generation and lease events.
CREATE TABLE leases (
  lease_id                      UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_reference               TEXT                      NOT NULL UNIQUE,  -- e.g. 'RBC-A-A-2018'
  lease_type                    lease_type_enum           NOT NULL,
  tenant_id                     UUID                      NOT NULL REFERENCES tenants(tenant_id),
  asset_id                      UUID                      NOT NULL REFERENCES assets(asset_id),
  commencement_date             DATE                      NOT NULL,
  expiry_date                   DATE,                                        -- NULL for periodic
  rent_commencement_date        DATE                      NOT NULL,
  rent_free_end_date            DATE,
  annual_rent                   NUMERIC(12, 2)            NOT NULL,
  billing_frequency             billing_frequency_enum    NOT NULL DEFAULT 'MONTHLY',
  billing_day                   SMALLINT                  NOT NULL DEFAULT 1
                                                          CHECK (billing_day BETWEEN 1 AND 28),
  next_rent_review_date         DATE,
  rent_review_basis             rent_review_basis_enum,
  rent_review_frequency_months  SMALLINT,
  periodic_review_prompt_months SMALLINT                  DEFAULT 18,
  break_clause_date             DATE,
  break_clause_party            break_clause_party_enum,
  break_clause_notes            TEXT,
  deposit_amount                NUMERIC(12, 2),
  deposit_type                  deposit_type_enum         NOT NULL DEFAULT 'NONE',
  repairing_obligation          repairing_obligation_enum,
  lease_state                   lease_state_enum          NOT NULL DEFAULT 'ACTIVE',
  termination_date              DATE,
  termination_reason            termination_reason_enum,
  -- document_id UUID added below after documents exists
  notes                         TEXT,
  active                        BOOLEAN                   NOT NULL DEFAULT TRUE,
  created_at                    TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  CONSTRAINT terminated_requires_date CHECK (
    lease_state != 'TERMINATED' OR termination_date IS NOT NULL
  )
);

CREATE INDEX idx_leases_tenant_id     ON leases(tenant_id);
CREATE INDEX idx_leases_asset_id      ON leases(asset_id);
CREATE INDEX idx_leases_lease_state   ON leases(lease_state);
CREATE INDEX idx_leases_expiry_date   ON leases(expiry_date)             WHERE active = TRUE;
CREATE INDEX idx_leases_review_date   ON leases(next_rent_review_date)   WHERE active = TRUE;
CREATE INDEX idx_leases_break_date    ON leases(break_clause_date)       WHERE active = TRUE;

CREATE TRIGGER trg_leases_updated_at
  BEFORE UPDATE ON leases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 5A — LEASE_UNITS junction table
-- Resolves the many-to-many relationship between leases and units.
-- One lease may cover multiple units (e.g. Fosse Healthcare: 4 suites, 1 invoice).
-- ============================================================

CREATE TABLE lease_units (
  lease_id    UUID         NOT NULL REFERENCES leases(lease_id),
  unit_id     UUID         NOT NULL REFERENCES units(unit_id),
  PRIMARY KEY (lease_id, unit_id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lease_units_unit_id  ON lease_units(unit_id);
CREATE INDEX idx_lease_units_lease_id ON lease_units(lease_id);

-- Enforce: a unit may have at most one non-terminated, active lease at any time.
-- Implemented as a trigger because the lease_state lives on the leases table.
CREATE OR REPLACE FUNCTION check_unique_active_lease_per_unit()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM lease_units lu
    JOIN leases l ON l.lease_id = lu.lease_id
    WHERE lu.unit_id = NEW.unit_id
      AND l.lease_state != 'TERMINATED'
      AND l.active = TRUE
      AND lu.lease_id != NEW.lease_id
  ) THEN
    RAISE EXCEPTION
      'Unit % already has an active or periodic lease. Terminate the existing lease before assigning a new one.',
      NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_unique_active_lease_per_unit
  BEFORE INSERT OR UPDATE ON lease_units
  FOR EACH ROW EXECUTE FUNCTION check_unique_active_lease_per_unit();


-- ============================================================
-- PHASE 5B — CHARGE PROFILES (depends on leases)
-- ============================================================

-- Configuration object defining what charges apply to a lease, at what VAT rate,
-- and how they are calculated. One profile per charge type per lease.
-- vat_deferred: true when VAT has been opted-to-tax but not yet charged on this
-- lease (will apply on renewal). Distinct from vat_treatment = VAT_DEFERRED which
-- indicates the treatment in the enum.
CREATE TABLE charge_profiles (
  profile_id               UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id                 UUID                      NOT NULL REFERENCES leases(lease_id),
  charge_type              charge_type_enum          NOT NULL,
  charge_label             TEXT,
  applies                  BOOLEAN                   NOT NULL DEFAULT TRUE,
  vat_treatment            vat_treatment_enum        NOT NULL,
  vat_deferred             BOOLEAN                   NOT NULL DEFAULT FALSE,
  billing_frequency        billing_frequency_enum,   -- NULL = inherit from lease
  calculation_method       calculation_method_enum   NOT NULL,
  fixed_amount_annual      NUMERIC(12, 2),
  apportionment_basis      apportionment_basis_enum,
  apportionment_percentage NUMERIC(7, 4),            -- e.g. 0.0823 = 8.23%
  active                   BOOLEAN                   NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  UNIQUE (lease_id, charge_type)
);

CREATE INDEX idx_charge_profiles_lease_id ON charge_profiles(lease_id);

CREATE TRIGGER trg_charge_profiles_updated_at
  BEFORE UPDATE ON charge_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 5C — RENT INCENTIVES (depends on leases)
-- ============================================================

-- Tracks fixed discounts and rent-free periods that modify the billed amount.
-- The billing engine checks incentive_end_date and reverts to headline rent
-- automatically the day after the incentive expires.
CREATE TABLE rent_incentives (
  incentive_id             UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id                 UUID                  NOT NULL REFERENCES leases(lease_id),
  incentive_type           incentive_type_enum   NOT NULL,
  headline_amount_annual   NUMERIC(12, 2)        NOT NULL,
  discount_amount_monthly  NUMERIC(10, 2),
  billed_amount_monthly    NUMERIC(10, 2)        NOT NULL,
  effective_amount_annual  NUMERIC(12, 2)        NOT NULL,
  incentive_start_date     DATE,
  incentive_end_date       DATE                  NOT NULL,
  notes                    TEXT,
  active                   BOOLEAN               NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rent_incentives_lease_id    ON rent_incentives(lease_id);
CREATE INDEX idx_rent_incentives_end_date    ON rent_incentives(incentive_end_date) WHERE active = TRUE;

CREATE TRIGGER trg_rent_incentives_updated_at
  BEFORE UPDATE ON rent_incentives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 6A — CHARGE RECORDS (depends on leases, units, tenants, assets)
-- ============================================================

-- The atomic unit of the billing layer. Every amount owed by a tenant is a charge record.
-- Charge records are immutable once status reaches ISSUED — corrections use CREDIT records.
-- gross_amount is computed (net + VAT) — never stored independently.
-- document_id FK added via ALTER TABLE after documents is created.
CREATE TABLE charge_records (
  charge_id       UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id        UUID                NOT NULL REFERENCES leases(lease_id),
  unit_id         UUID                NOT NULL REFERENCES units(unit_id),
  tenant_id       UUID                NOT NULL REFERENCES tenants(tenant_id),
  asset_id        UUID                NOT NULL REFERENCES assets(asset_id),
  charge_type     charge_type_enum    NOT NULL,
  charge_label    TEXT                NOT NULL,
  period_start    DATE                NOT NULL,
  period_end      DATE                NOT NULL,
  net_amount      NUMERIC(12, 2)      NOT NULL,
  vat_amount      NUMERIC(12, 2)      NOT NULL DEFAULT 0,
  gross_amount    NUMERIC(12, 2)      GENERATED ALWAYS AS (net_amount + vat_amount) STORED,
  vat_rate        NUMERIC(6, 4)       NOT NULL DEFAULT 0,
  due_date        DATE                NOT NULL,
  status          charge_status_enum  NOT NULL DEFAULT 'DRAFT',
  issued_date     DATE,
  payment_date    DATE,
  payment_amount  NUMERIC(12, 2),
  generated_by    generated_by_enum   NOT NULL DEFAULT 'SYSTEM',
  -- document_id UUID added below after documents exists
  notes           TEXT,
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  CONSTRAINT issued_requires_date CHECK (
    status = 'DRAFT' OR issued_date IS NOT NULL
  ),
  CONSTRAINT valid_period CHECK (period_start <= period_end)
);

CREATE INDEX idx_charge_records_lease_id  ON charge_records(lease_id);
CREATE INDEX idx_charge_records_tenant_id ON charge_records(tenant_id);
CREATE INDEX idx_charge_records_asset_id  ON charge_records(asset_id);
CREATE INDEX idx_charge_records_status    ON charge_records(status);
CREATE INDEX idx_charge_records_due_date  ON charge_records(due_date);
CREATE INDEX idx_charge_records_unit_id   ON charge_records(unit_id);

CREATE TRIGGER trg_charge_records_updated_at
  BEFORE UPDATE ON charge_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 6B — METER READS (depends on meters, charge_records)
-- ============================================================

-- Each read captures a physical meter reading. The billing engine calculates
-- consumption (this reading minus previous) on save. charge_id is populated
-- once a recharge charge record has been generated from this read.
CREATE TABLE meter_reads (
  read_id         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id        UUID            NOT NULL REFERENCES meters(meter_id),
  read_date       DATE            NOT NULL,
  reading_value   NUMERIC(12, 2)  NOT NULL,
  read_type       read_type_enum  NOT NULL DEFAULT 'ACTUAL',
  entered_by      TEXT            NOT NULL,
  consumption_kwh NUMERIC(12, 4), -- Calculated: this reading − previous reading; NULL for first read
  charge_id       UUID            REFERENCES charge_records(charge_id),
  notes           TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Ordered index for efficient "previous reading" lookups
CREATE INDEX idx_meter_reads_meter_date ON meter_reads(meter_id, read_date DESC);

CREATE TRIGGER trg_meter_reads_updated_at
  BEFORE UPDATE ON meter_reads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 7A — COMPLIANCE RECORDS (depends on assets, units, contractors)
-- ============================================================

-- Tracks statutory and insurance obligations for each asset.
-- When a certificate is renewed, a new record is created — the old record
-- is retained (active = false) for audit purposes.
-- document_id FK added via ALTER TABLE after documents is created.
CREATE TABLE compliance_records (
  compliance_id        UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id             UUID                    NOT NULL REFERENCES assets(asset_id),
  unit_id              UUID                    REFERENCES units(unit_id),      -- NULL = whole asset
  compliance_type      compliance_type_enum    NOT NULL,
  description          TEXT                    NOT NULL,
  certificate_date     DATE,
  expiry_date          DATE,
  next_due_date        DATE,                   -- Calculated: expiry_date − alert_threshold_days
  contractor_id        UUID                    REFERENCES contractors(contractor_id),
  status               compliance_status_enum  NOT NULL DEFAULT 'COMPLIANT',
  alert_threshold_days INTEGER                 NOT NULL DEFAULT 90,
  -- document_id UUID added below after documents exists
  notes                TEXT,
  active               BOOLEAN                 NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_asset_id ON compliance_records(asset_id);
CREATE INDEX idx_compliance_expiry   ON compliance_records(expiry_date) WHERE active = TRUE;
CREATE INDEX idx_compliance_status   ON compliance_records(status);

CREATE TRIGGER trg_compliance_records_updated_at
  BEFORE UPDATE ON compliance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 7B — MAINTENANCE EVENTS (depends on assets, units, contractors, tenants)
-- ============================================================

-- Lightweight event-level maintenance tracking (not a full FM workflow).
-- document_id FK added via ALTER TABLE after documents is created.
CREATE TABLE maintenance_events (
  maintenance_id         UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id               UUID                       NOT NULL REFERENCES assets(asset_id),
  unit_id                UUID                       REFERENCES units(unit_id),
  category               maintenance_category_enum  NOT NULL,
  description            TEXT                       NOT NULL,
  priority               maintenance_priority_enum  NOT NULL DEFAULT 'ROUTINE',
  reported_date          DATE                       NOT NULL,
  contractor_id          UUID                       REFERENCES contractors(contractor_id),
  quoted_cost            NUMERIC(12, 2),
  authorised_cost        NUMERIC(12, 2),
  target_completion_date DATE,
  actual_completion_date DATE,
  rechargeable_to_tenant BOOLEAN                    NOT NULL DEFAULT FALSE,
  tenant_id              UUID                       REFERENCES tenants(tenant_id),
  status                 maintenance_status_enum    NOT NULL DEFAULT 'REPORTED',
  -- document_id UUID added below after documents exists
  notes                  TEXT,
  active                 BOOLEAN                    NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  CONSTRAINT rechargeable_requires_tenant CHECK (
    rechargeable_to_tenant = FALSE OR tenant_id IS NOT NULL
  )
);

CREATE INDEX idx_maintenance_asset_id ON maintenance_events(asset_id);
CREATE INDEX idx_maintenance_status   ON maintenance_events(status);

CREATE TRIGGER trg_maintenance_events_updated_at
  BEFORE UPDATE ON maintenance_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 7C — DOCUMENTS
-- ============================================================

-- Reference store only — file content lives in OneDrive.
-- Stores metadata and the file_reference (path/URL).
-- Nullable FKs cover the most common associations directly.
-- document_links (below) handles any-entity flexible linking.
CREATE TABLE documents (
  document_id    UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name  TEXT                 NOT NULL,
  document_type  document_type_enum   NOT NULL,
  file_reference TEXT                 NOT NULL,  -- OneDrive path or URL
  file_format    file_format_enum     NOT NULL,
  upload_date    DATE                 NOT NULL DEFAULT CURRENT_DATE,
  uploaded_by    TEXT                 NOT NULL,
  asset_id       UUID                 REFERENCES assets(asset_id),
  unit_id        UUID                 REFERENCES units(unit_id),
  lease_id       UUID                 REFERENCES leases(lease_id),
  tenant_id      UUID                 REFERENCES tenants(tenant_id),
  charge_id      UUID                 REFERENCES charge_records(charge_id),
  compliance_id  UUID                 REFERENCES compliance_records(compliance_id),
  maintenance_id UUID                 REFERENCES maintenance_events(maintenance_id),
  created_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_asset_id  ON documents(asset_id);
CREATE INDEX idx_documents_lease_id  ON documents(lease_id);
CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX idx_documents_charge_id ON documents(charge_id);

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 7D — SIGNIFICANT EVENTS
-- ============================================================

-- Institutional memory layer. Only material operational events are captured.
-- Not a communications log — see spec Section 8.1 for what qualifies.
CREATE TABLE significant_events (
  event_id       UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date     DATE                  NOT NULL,
  event_category event_category_enum   NOT NULL,
  title          TEXT                  NOT NULL,
  description    TEXT                  NOT NULL,
  asset_id       UUID                  REFERENCES assets(asset_id),
  unit_id        UUID                  REFERENCES units(unit_id),
  lease_id       UUID                  REFERENCES leases(lease_id),
  tenant_id      UUID                  REFERENCES tenants(tenant_id),
  contractor_id  UUID                  REFERENCES contractors(contractor_id),
  document_id    UUID                  REFERENCES documents(document_id),
  recorded_by    TEXT                  NOT NULL,
  created_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sig_events_asset_id   ON significant_events(asset_id);
CREATE INDEX idx_sig_events_tenant_id  ON significant_events(tenant_id);
CREATE INDEX idx_sig_events_event_date ON significant_events(event_date DESC);

CREATE TRIGGER trg_significant_events_updated_at
  BEFORE UPDATE ON significant_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- PHASE 8 — JUNCTION TABLES (Arch Spec Section 10.2)
-- ============================================================

-- Flexible document-to-entity links
-- Allows a single document to be associated with multiple entities of any type.
-- Supplements the direct FK columns on the documents table.
CREATE TABLE document_links (
  document_id  UUID              NOT NULL REFERENCES documents(document_id),
  entity_type  entity_type_enum  NOT NULL,
  entity_id    UUID              NOT NULL,
  PRIMARY KEY (document_id, entity_type, entity_id),
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_links_entity ON document_links(entity_type, entity_id);


-- Flexible event-to-entity links
-- Allows a significant event to reference multiple entities simultaneously.
-- Supplements the direct FK columns on significant_events.
CREATE TABLE event_links (
  event_id     UUID              NOT NULL REFERENCES significant_events(event_id),
  entity_type  entity_type_enum  NOT NULL,
  entity_id    UUID              NOT NULL,
  PRIMARY KEY (event_id, entity_type, entity_id),
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_links_entity ON event_links(entity_type, entity_id);


-- ============================================================
-- PHASE 9 — CIRCULAR FOREIGN KEYS (added after both sides exist)
-- ============================================================

-- Lease → Document (reference to executed lease document)
ALTER TABLE leases
  ADD COLUMN document_id UUID REFERENCES documents(document_id);

-- Charge Record → Document (reference to generated billing document)
ALTER TABLE charge_records
  ADD COLUMN document_id UUID REFERENCES documents(document_id);

-- Compliance Record → Document (certificate or assessment report)
ALTER TABLE compliance_records
  ADD COLUMN document_id UUID REFERENCES documents(document_id);

-- Maintenance Event → Document (quote, instruction, or completion certificate)
ALTER TABLE maintenance_events
  ADD COLUMN document_id UUID REFERENCES documents(document_id);


-- ============================================================
-- COMMENTS — key design decisions for future developers
-- ============================================================

COMMENT ON COLUMN portfolios.income_owned IS
  'FALSE for managed portfolios (e.g. Southgate). Excludes from owned-portfolio financial reporting.';

COMMENT ON COLUMN charge_profiles.vat_deferred IS
  'TRUE when VAT has been opted-to-tax at asset level but is not yet being charged on this lease. '
  'Will apply on lease renewal. See data spec VAT notes for RBC and Southgate units.';

COMMENT ON COLUMN charge_profiles.vat_treatment IS
  'VAT_DEFERRED: opted-to-tax asset where VAT is not currently charged on this lease.';

COMMENT ON COLUMN units.merged_into_unit_id IS
  'Used ONLY for permanent physical merges (wall removed). '
  'For leases covering multiple units, use the lease_units junction table instead.';

COMMENT ON COLUMN leases.billing_day IS
  'Day of month charges fall due. Capped at 28 to be safe across all months. '
  'If the billing day falls on a weekend, the billing engine generates on the preceding Friday.';

COMMENT ON TABLE lease_units IS
  'Many-to-many: one lease may cover multiple units (e.g. Fosse Healthcare — 4 suites, 1 invoice). '
  'A unit may have only one non-TERMINATED active lease at any time (enforced by trigger).';

COMMENT ON COLUMN charge_records.gross_amount IS
  'Computed column: net_amount + vat_amount. Never set directly.';

COMMENT ON COLUMN documents.file_reference IS
  'OneDrive path or URL. System stores reference only — file content is not stored in the database.';

COMMENT ON TABLE rent_incentives IS
  'Tracks fixed discounts and rent-free periods. Billing engine reverts to headline rent '
  'automatically on the day after incentive_end_date.';
