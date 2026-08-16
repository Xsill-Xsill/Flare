import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'

type ServerAuthClient = {
  auth: {
    getUser: SupabaseClient['auth']['getUser']
    signOut: SupabaseClient['auth']['signOut']
  }
}

export async function createClient(): Promise<ServerAuthClient> {
  const headerStore = await headers()
  const bearerToken = headerStore.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null

  // Requests from the Chrome extension carry `Authorization: Bearer <token>` instead of
  // session cookies — a chrome-extension:// origin can't read/write the app's httpOnly
  // cookies. Validate that token directly against Supabase rather than going through the
  // cookie-based session flow the web app uses.
  if (bearerToken) {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    return {
      auth: {
        getUser: () => supabase.auth.getUser(bearerToken),
        signOut: () => supabase.auth.signOut(),
      },
    }
  }

  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
