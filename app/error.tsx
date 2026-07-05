'use client'

// Route error boundary: a failed database query now surfaces here instead of
// silently rendering zeros on financial pages.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="p-8 max-w-xl">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-800 mb-2">This page could not load its data</h2>
        <p className="text-sm text-red-700 mb-1">
          The figures below may be incomplete, so nothing is shown rather than showing wrong numbers.
        </p>
        <p className="text-xs text-red-500 font-mono break-words mb-4">
          {error.message}
          {error.digest ? ` (ref ${error.digest})` : ''}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
