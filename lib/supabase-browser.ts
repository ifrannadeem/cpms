import { createBrowserClient } from '@supabase/ssr'

// Session-aware browser client. The user's session is stored in cookies so the
// middleware and server can see it, and every RPC call carries the user's JWT.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
