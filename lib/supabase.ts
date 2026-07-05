import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const raw = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

/**
 * Server-side client that THROWS when a query fails instead of resolving with
 * { data: null, error }. Every server page destructures only { data }, so before
 * this wrapper a failed query silently rendered as £0 / empty — indistinguishable
 * from genuinely clean books. Now failures surface via the route error boundary.
 *
 * Call sites keep the standard shape: `const { data } = await supabase.from(...)...`
 */
function wrap<T extends object>(obj: T): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        const then = Reflect.get(target, prop, receiver)
        if (typeof then !== 'function') return then
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          then.call(
            target,
            (res: unknown) => {
              const r = res as { error?: { message?: string; code?: string } | null } | null
              // PGRST116 = .single() matched no rows. Pages handle { data: null } for
              // that case themselves (not-found UI), so it is not treated as a failure.
              if (r && typeof r === 'object' && r.error && r.error.code !== 'PGRST116') {
                const err = new Error(`Database query failed: ${r.error.message ?? String(r.error)}`)
                if (onRejected) return onRejected(err)
                throw err
              }
              return onFulfilled ? onFulfilled(res) : res
            },
            onRejected,
          )
      }
      const value = Reflect.get(target, prop, receiver)
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const result = value.apply(target, args)
          return result && typeof result === 'object' ? wrap(result as object) : result
        }
      }
      return value && typeof value === 'object' ? wrap(value as object) : value
    },
  }) as T
}

export const supabase = wrap(raw)

/**
 * The unwrapped client, for the rare call site that must inspect the error itself
 * (e.g. best-effort writes that should not fail the request).
 */
export const supabaseUnchecked = raw
