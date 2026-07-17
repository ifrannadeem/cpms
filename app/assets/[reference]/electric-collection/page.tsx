import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import CollectionMatrix from '@/components/collection-matrix'

interface Props {
  params: Promise<{ reference: string }>
  searchParams: Promise<{ year?: string }>
}

export default async function ElectricCollectionPage({ params, searchParams }: Props) {
  const { reference } = await params
  const sp = await searchParams
  const year = /^\d{4}$/.test(sp.year ?? '') ? parseInt(sp.year!, 10) : new Date().getFullYear()

  const { data: asset } = await supabase
    .from('assets')
    .select('asset_id, asset_name')
    .eq('asset_reference', reference)
    .single()

  if (!asset) {
    return (
      <div className="p-8">
        <p className="text-red-500 mb-4">Asset not found: {reference}</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm">{String.fromCharCode(0x2190)} Back to dashboard</Link>
      </div>
    )
  }

  return (
    <CollectionMatrix
      reference={reference}
      assetId={asset.asset_id}
      assetName={asset.asset_name}
      year={year}
      type="ELECTRIC"
    />
  )
}
