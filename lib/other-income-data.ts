import { supabase } from './supabase'
import type { OtherIncomeReceipt, OtherIncomeSource } from './other-income'

/**
 * Every other-income source and live receipt for one property. The volume is small (a
 * handful of lines a month), and the report rules need the full history to know where
 * each recurring source's nil lines begin, so this reads it all rather than a window.
 * Removed receipts are excluded: they were recorded in error.
 */
export async function fetchOtherIncome(assetId: string): Promise<{
  sources: OtherIncomeSource[]
  receipts: OtherIncomeReceipt[]
}> {
  const [{ data: sources }, { data: receipts }] = await Promise.all([
    supabase.from('other_income_sources')
      .select('source_id, name, payer, recurring, active')
      .eq('asset_id', assetId)
      .order('name'),
    supabase.from('other_income_receipts')
      .select('receipt_id, source_id, period_month, received_date, net_amount, vat_amount, gross_amount, description')
      .eq('asset_id', assetId)
      .eq('removed', false),
  ])

  return {
    sources: (sources ?? []).map(s => ({
      source_id: s.source_id, name: s.name, payer: s.payer, recurring: s.recurring, active: s.active,
    })),
    receipts: (receipts ?? []).map(r => ({
      receipt_id: r.receipt_id,
      source_id: r.source_id,
      period_month: r.period_month,
      received_date: r.received_date,
      net: parseFloat(r.net_amount ?? '0'),
      vat: parseFloat(r.vat_amount ?? '0'),
      gross: parseFloat(r.gross_amount ?? '0'),
      description: r.description,
    })),
  }
}
