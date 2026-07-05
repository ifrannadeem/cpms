import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

/**
 * Server-verified session lookup for Route Handlers and Server Components.
 *
 * Defence in depth: middleware.ts already gates every route, but API routes run
 * with the service-role client, so they must not rely on middleware alone
 * (middleware bypasses are a recurring Next.js CVE class). Each route calls this
 * and returns 401 when there is no authenticated user.
 */
export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Route handlers do not refresh cookies; middleware owns that.
        },
      },
    },
  )
  const { data: { user } } = await supa.auth.getUser()
  return user
}

/** 401 response shared by the API routes. */
export function unauthorised(): NextResponse {
  return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
}
