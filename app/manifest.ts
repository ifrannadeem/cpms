import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CPMS — Commercial Portfolio Operating System',
    short_name: 'CPMS',
    description: '2i Investments — Commercial Property Management',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}