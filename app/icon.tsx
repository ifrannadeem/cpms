import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

// Branded favicon: Opera "O" mark on the deep-navy brand background.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d1b2a',
          color: '#3b82f6',
          fontSize: 340,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        O
      </div>
    ),
    { ...size },
  )
}