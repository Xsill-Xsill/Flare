import { supabase } from '@/lib/supabase'

export default async function Home() {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })

  return (
    <main style={{ padding: 40, fontFamily: 'monospace', background: 'black', color: 'lime', minHeight: '100vh' }}>
      <h1>🔥 FLARE v0.1</h1>
      {error ? (
        <p>Supabase: ✗ {error.message}</p>
      ) : (
        <>
          <p>Supabase: ✓ connected</p>
          <pre>{JSON.stringify(tasks, null, 2)}</pre>
        </>
      )}
    </main>
  )
}
