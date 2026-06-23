# CPMS — Deferred Work / Backlog
Running list of agreed-but-not-yet-built items, so nothing is lost between sessions.

## Admin: meters & units (data model already supports this)
**Add a meter to a unit** — needed when we decide to start billing electric for a unit that has no sub-meter yet (e.g. Rosehill Units 6, 8, 9). Flow: register a meter on the unit → enter a baseline reading (records the start value, raises no charge) → from the next cycle, readings raise charges automatically. The entry form must also allow the *first* reading (today it requires a prior reading).

**Split / merge a unit** — needed e.g. for Southgate: splitting **Suite 2.5-2.6** into **Suite 2.5** and **Suite 2.6**. The schema already provisions for this: `units.split_from_unit_id` / `units.merged_into_unit_id`, and leases attach to units via the `lease_units` many-to-many junction. So the work is a small admin screen to create the new units, point them at the original, and reassign leases/meters — not a structural change.

> Build these admin screens at the point of need (when actually billing 6/8/9 or splitting the Southgate suites). Until then they're done via SQL/seed.

## Other deferred items (cross-referenced)
- **Phase 3 — invoice lifecycle:** void/credit function; per-charge "edit this draft" amount/VAT override (see BILLING_REDESIGN_PLAN.md).
- **Phase 7 — email dispatch automation:** auto-send issued invoices by each tenant's preferred method; send log; per-entity sender (see BILLING_REDESIGN_PLAN.md).
- **Meter rollover:** keep the manual "put a 1 in front" method — agreed not to automate. Optional tiny nicety: warn when a new reading is lower than the previous (possible meter reset).
