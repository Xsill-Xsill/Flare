import { createClient } from '@supabase/supabase-js'

async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { ok: false, msg: 'env vars missing' }

  const supabase = createClient(url, key)
  const { error } = await supabase.from('_test_nonexistent').select('*').limit(1)
  if (!error) return { ok: true, msg: 'connected' }
  // PGRST116 = relation not found = DB is reachable
  // Any PGRST* error = PostgREST responded = connection works
  if (error.code?.startsWith('PGRST')) {
    return { ok: true, msg: 'connected' }
  }
  return { ok: false, msg: `${error.code}: ${error.message}` }
}

export default async function Home() {
  const { ok, msg } = await checkSupabase()

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', background: 'black', color: 'lime', minHeight: '100vh' }}>
      <h1>🔥 FLARE v0.1</h1>
      <p>Supabase: {ok ? `✓ ${msg}` : `✗ ${msg}`}</p>
    </main>
  )
}
