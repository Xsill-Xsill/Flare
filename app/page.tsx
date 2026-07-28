import { createClient } from '@supabase/supabase-js'

async function checkSupabase() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error } = await supabase.from('_test_nonexistent').select('*').limit(1)
  // PGRST116 = table not found = connection works
  return !error || error.code === 'PGRST116' || error.message.includes('not exist')
}

export default async function Home() {
  const connected = await checkSupabase()

  return (
    <main style={{ padding: 40, fontFamily: 'monospace' }}>
      <h1>Flare</h1>
      <p>Supabase: {connected ? '✓ connected' : '✗ error'}</p>
    </main>
  )
}
