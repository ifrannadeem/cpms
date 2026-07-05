import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // lib/supabase.ts creates its client at module scope; dummy values keep pure-
    // function tests importable without a live database.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://dummy.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-key',
    },
  },
})
