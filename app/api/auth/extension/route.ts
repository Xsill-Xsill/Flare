import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { applyCors, preflightResponse } from '@/lib/http/cors'

// Password-grant login for the Chrome extension. The extension runs on a chrome-extension://
// origin and can't share the web app's httpOnly session cookies, so it exchanges email +
// password here for a raw access token it stores itself and sends back as
// `Authorization: Bearer <token>` on every other API call.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password) {
    return applyCors(req, NextResponse.json({ error: 'email and password are required' }, { status: 400 }))
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session || !data.user) {
    return applyCors(req, NextResponse.json({ error: error?.message ?? 'Invalid credentials' }, { status: 401 }))
  }

  return applyCors(req, NextResponse.json({ access_token: data.session.access_token, user_id: data.user.id }))
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req)
}
