import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Opera — Commercial Property Management',
    short_name: 'Opera',
    description: '2i Investments — Commercial Property Management',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d1b2a',
    theme_color: '#0d1b2a',
    icons: [
      { src: '/opera-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/opera-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/opera-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}