import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AssetTabs from '@/components/asset-tabs'
import ElectricInvoicingClient from './invoicing-electric-client'

interface Props {
  params: Promise<{ reference: string }>
}

const DASH = String.fromCharCode(0x2014)

export default async function InvoicingElectricPage({ params }: Props) {
  const { reference } = await params

  const { data: asset } = await supabase
    .from('assets')
    .select('asset_id, asset_name, asset_reference')
    .eq('asset_reference', reference)
    .single()

  if (!asset) {
    return (
      <div className="p-8">
        <p className="text-red-500 mb-4">Asset not found: {reference}</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm">
          {String.fromCharCode(0x2190)} Back to dashboard
        </Link>
      </div>
    )
  }

  const { data: charges } = await supabase
    .from('v_charge_ledger')
    .select('charge_id, unit_reference, tenant_name, charge_label, period_start, period_end, net_amount, vat_amount, gross_amount, vat_rate, status, sent_date, sent_method, preferred_delivery_method')
    .eq('asset_id', asset.asset_id)
    .eq('charge_type', 'ELECTRIC')
    .order('unit_reference', { ascending: true })

  // Safety net: charges raised while a meter's billing was ON stay live after it is
  // switched off. Nothing cancels them automatically (a final bill can be genuinely
  // due), so any still open are flagged here for a decision.
  const { data: offMeters } = await supabase
    .from('meters')
    .select('unit_id')
    .eq('asset_id', asset.asset_id)
    .eq('active', false)
  const offUnitIds = new Set((offMeters ?? []).map(m => m.unit_id))
  const { data: chargeUnits } = await supabase
    .from('charge_records')
    .select('charge_id, unit_id')
    .eq('asset_id', asset.asset_id)
    .eq('charge_type', 'ELECTRIC')
    .in('status', ['DRAFT', 'APPROVED', 'ISSUED', 'OVERDUE', 'PART_PAID'])
  const openOffChargeIds = new Set(
    (chargeUnits ?? []).filter(c => offUnitIds.has(c.unit_id)).map(c => c.charge_id)
  )
  const billingOffOpen = (charges ?? []).filter(c => openOffChargeIds.has(c.charge_id))

  const electricRows = (charges ?? []).map(c => ({
    charge_id: c.charge_id as string,
    unit_reference: (c.unit_reference ?? '') as string,
    tenant_name: (c.tenant_name ?? '') as string,
    charge_label: (c.charge_label ?? '') as string,
    period: String(c.period_start ?? ''),          // period key = period_start (a reading cycle)
    period_end: String(c.period_end ?? ''),
    net_amount: Number(c.net_amount ?? 0),
    vat_amount: Number(c.vat_amount ?? 0),
    gross_amount: Number(c.gross_amount ?? 0),
    vat_rate: Number(c.vat_rate ?? 0),
    status: c.status as string,
    sent_date: (c.sent_date ?? null) as string | null,
    sent_method: (c.sent_method ?? null) as string | null,
    preferred_method: (c.preferred_delivery_method ?? 'EMAIL') as string,
  }))

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <nav className="text-sm text-slate-400 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-slate-600">Dashboard</Link>
        <span>/</span>
        <Link href={`/assets/${reference}`} className="hover:text-slate-600">{asset.asset_name}</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">Electric: Invoicing</span>
      </nav>

      <AssetTabs reference={reference} active="invoicing-electric" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{asset.asset_name} {DASH} Electric: Invoicing</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review each meter-reading cycle: approve, issue, then record dispatch.
          Electric drafts are created from meter readings on the Electric screen; issued charges move to Billing as amounts due.
        </p>
      </div>

      {billingOffOpen.length > 0 && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <p className="font-semibold mb-1">
            {billingOffOpen.length} open invoice{billingOffOpen.length !== 1 ? 's' : ''} on meter{billingOffOpen.length !== 1 ? 's' : ''} now set to billing off
          </p>
          <p className="text-xs text-amber-800 mb-2">
            These were raised while billing was on. If the tenant does not pay electric, open each one and use
            Cancel; if it is a genuine final bill, leave it to be collected.
          </p>
          <ul className="text-xs space-y-0.5">
            {billingOffOpen.map(c => (
              <li key={c.charge_id}>
                <Link href={`/assets/${reference}/billing/${c.charge_id}`} className="text-amber-900 font-medium underline hover:text-amber-700">
                  {c.tenant_name} {DASH} {c.charge_label} {DASH} {String.fromCharCode(0xA3)}{Number(c.gross_amount ?? 0).toFixed(2)} ({c.status})
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ElectricInvoicingClient
        assetId={asset.asset_id}
        assetReference={reference}
        electricRows={electricRows}
      />
    </div>
  )
}
