import { createClient } from '@supabase/supabase-js'

// ─── конфиг ────────────────────────────────────────────────
const SUPABASE_URL = 'https://xtupcxnjmkuxnmpbcrhj.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY

if (!SUPABASE_SERVICE_ROLE_KEY || !INNGEST_EVENT_KEY) {
  console.error('❌ Нужны переменные окружения. Запускай так:')
  console.error('   SUPABASE_SERVICE_ROLE_KEY=... INNGEST_EVENT_KEY=... node test-backend.mjs')
  process.exit(1)
}
// ───────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function run() {
  // ── 1. Создать тестового юзера (если нет) ────────────────
  console.log('\n👤 Создаём тестового юзера...')
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email: 'test@flare.dev',
    password: 'test123456',
    email_confirm: true,
  })

  let userId
  if (createError?.message?.includes('already been registered')) {
    const { data: users } = await supabase.auth.admin.listUsers()
    const existing = users.users.find(u => u.email === 'test@flare.dev')
    userId = existing.id
    console.log('✅ Юзер уже существует:', userId)
  } else if (createError) {
    console.error('❌ Ошибка создания юзера:', createError.message)
    process.exit(1)
  } else {
    userId = newUser.user.id
    console.log('✅ Юзер создан:', userId)
  }

  // ── 2. Создать workspace ──────────────────────────────────
  console.log('\n📁 Создаём workspace...')
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({ owner_id: userId, name: 'Test Workspace' })
    .select()
    .single()

  if (wsError) { console.error('❌ Workspace error:', wsError.message); process.exit(1) }
  console.log('✅ Workspace создан:', workspace.id)

  // ── 3. Создать text item ──────────────────────────────────
  console.log('\n📝 Создаём text item...')
  const { data: item, error: itemError } = await supabase
    .from('items')
    .insert({
      workspace_id: workspace.id,
      type: 'text',
      raw_content: 'Founders need to talk to users every week. The best products come from deep customer empathy. We pivoted three times before finding product-market fit.',
      status: 'queued',
    })
    .select()
    .single()

  if (itemError) { console.error('❌ Item error:', itemError.message); process.exit(1) }
  console.log('✅ Item создан:', item.id, '| статус:', item.status)

  // ── 4. Отправить событие в Inngest ────────────────────────
  console.log('\n🚀 Отправляем событие в Inngest...')
  const inngestRes = await fetch('http://localhost:8288/e/' + INNGEST_EVENT_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'item/created', data: { itemId: item.id } }),
  })

  if (!inngestRes.ok) {
    console.error('❌ Inngest error:', await inngestRes.text())
    process.exit(1)
  }
  console.log('✅ Событие отправлено → проверяй localhost:8288')

  // ── 5. Polling статуса item ───────────────────────────────
  console.log('\n⏳ Ждём обработки (до 60 сек)...')
  for (let i = 0; i < 12; i++) {
    await sleep(5000)
    const { data: current } = await supabase
      .from('items')
      .select('status')
      .eq('id', item.id)
      .single()

    console.log(`   [${(i + 1) * 5}s] статус: ${current?.status}`)

    if (current?.status === 'done') {
      console.log('\n✅ Обработка завершена!')

      // Показать chunks
      const { data: chunks } = await supabase.from('chunks').select('id, token_count, content').eq('item_id', item.id)
      console.log(`\n📦 Chunks (${chunks?.length}):`)
      chunks?.forEach((c, i) => console.log(`   [${i + 1}] ${c.token_count} токенов: "${c.content.slice(0, 80)}..."`))

      // Показать claims
      const { data: claims } = await supabase.from('claims').select('statement').eq('item_id', item.id)
      console.log(`\n💡 Claims (${claims?.length}):`)
      claims?.forEach((c, i) => console.log(`   [${i + 1}] ${c.statement}`))
      break
    }

    if (current?.status === 'failed') {
      console.log('\n❌ Обработка упала — смотри логи на localhost:8288')
      break
    }
  }

  console.log('\n🏁 Тест завершён.\n')
}

run().catch(console.error)
