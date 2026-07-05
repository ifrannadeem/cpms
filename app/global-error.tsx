'use client'

// Last-resort boundary (errors thrown in the root layout itself).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
        <h2>Opera hit an unexpected error</h2>
        <p style={{ color: '#b91c1c', fontFamily: 'monospace', fontSize: 13 }}>
          {error.message}
          {error.digest ? ` (ref ${error.digest})` : ''}
        </p>
        <button onClick={reset} style={{ padding: '8px 16px', marginTop: 12 }}>
          Try again
        </button>
      </body>
    </html>
  )
}
