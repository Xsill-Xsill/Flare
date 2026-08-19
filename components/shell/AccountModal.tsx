'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'

type Tab = 'account' | 'plan' | 'billing'
type Plan = 'basic' | 'plus'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'account', label: 'Account', icon: 'person' },
  { key: 'plan', label: 'Plan', icon: 'workspace_premium' },
  { key: 'billing', label: 'Billing', icon: 'receipt_long' },
]

export function AccountModal({
  open,
  onClose,
  userName,
  userEmail,
  onPlanChange,
}: {
  open: boolean
  onClose: () => void
  userName: string
  userEmail: string
  onPlanChange: (plan: Plan) => void
}) {
  const [activeTab, setActiveTab] = useState<Tab>('account')
  const [plan, setPlan] = useState<Plan>('basic')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true))
      document.body.style.overflow = 'hidden'
    } else {
      requestAnimationFrame(() => setVisible(false))
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  function switchPlan(next: Plan) {
    setPlan(next)
    onPlanChange(next)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-lg">
      <div
        className="absolute inset-0 transition-opacity duration-200 ease-out"
        style={{
          background: 'rgba(26,38,32,0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          opacity: visible ? 1 : 0,
        }}
        onClick={onClose}
      />
      <div
        className="relative bg-white flex flex-col w-full h-full sm:h-[640px] sm:rounded-xl transition-all duration-200 ease-out overflow-hidden"
        style={{
          maxWidth: 880,
          maxHeight: '100vh',
          boxShadow: '0 24px 64px rgba(26,38,32,0.28)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.96)',
        }}
      >
        <div className="flex items-center justify-between px-lg py-md shrink-0 border-b border-[#D8E2DC]">
          <h2 className="font-ui-semibold" style={{ fontSize: 15, color: '#1A2620' }}>
            Account
          </h2>
          <button
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors active:scale-95 hover:bg-[#EEF2F0]"
            style={{ color: '#5C6F65' }}
            type="button"
            onClick={onClose}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="flex-1 flex flex-col sm:flex-row min-h-0">
          <div
            className="w-full sm:w-[200px] shrink-0 flex flex-row sm:flex-col gap-xs px-sm py-sm overflow-x-auto hide-scrollbar border-b sm:border-b-0 sm:border-r border-[#D8E2DC]"
            style={{ background: '#F7F9F8' }}
          >
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab
              return (
                <button
                  key={tab.key}
                  className="flex-1 sm:flex-none flex items-center justify-center sm:justify-start gap-2 px-sm py-sm rounded-lg text-sm font-ui-semibold whitespace-nowrap transition-colors"
                  style={{ background: isActive ? '#D1FAE5' : 'transparent', color: isActive ? '#0D9F6E' : '#3d4a42' }}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span className="material-symbols-outlined text-[18px]">{tab.icon}</span> {tab.label}
                </button>
              )
            })}
          </div>
          <div className="flex-1 overflow-y-auto px-lg py-lg">
            {activeTab === 'account' && <AccountTab userName={userName} userEmail={userEmail} />}
            {activeTab === 'plan' && <PlanTab plan={plan} onSwitch={switchPlan} />}
            {activeTab === 'billing' && <BillingTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

function AccountTab({ userName, userEmail }: { userName: string; userEmail: string }) {
  const router = useRouter()
  const [name, setName] = useState(userName)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === userName) return
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ data: { full_name: trimmed } })
    setSaving(false)
    if (updateError) {
      setError('Не удалось сохранить имя, попробуйте снова')
      return
    }
    setSaved(true)
    router.refresh()
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <div>
      <h3 className="font-display-sm mb-lg" style={{ fontSize: 20, fontWeight: 800, color: '#1A2620' }}>
        Account
      </h3>
      <div className="flex items-center gap-md mb-xl">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white font-ui-semibold shrink-0"
          style={{ background: '#0D9F6E', fontSize: 22 }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <button
            className="text-sm font-ui-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: '#FFFFFF', border: '1.5px solid #D8E2DC', color: '#1A2620' }}
            type="button"
            disabled
          >
            Upload photo
          </button>
          <p className="text-xs mt-1" style={{ color: '#5C6F65' }}>
            JPG or PNG, up to 5MB
          </p>
        </div>
      </div>
      <div className="mb-lg">
        <label className="block text-xs font-ui-semibold mb-1" style={{ color: '#5C6F65' }}>
          Name
        </label>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
            style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620' }}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors active:scale-95 shrink-0 hover:bg-[#0b8a5f] disabled:opacity-60"
            style={{ background: '#0D9F6E' }}
            type="button"
            disabled={saving || !name.trim() || name.trim() === userName}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
        {error && (
          <p className="text-xs mt-1.5" style={{ color: '#ba1a1a' }}>
            {error}
          </p>
        )}
      </div>
      <div className="mb-xl">
        <label className="block text-xs font-ui-semibold mb-1" style={{ color: '#5C6F65' }}>
          Email
        </label>
        <p className="text-sm" style={{ color: '#1A2620' }}>
          {userEmail}
        </p>
      </div>
      <div className="border-t pt-lg" style={{ borderColor: '#D8E2DC' }}>
        <form action={signOut}>
          <button
            className="flex items-center gap-1 text-sm font-ui-semibold px-3 py-2 rounded-lg transition-colors hover:bg-[#EEF2F0]"
            style={{ color: '#ba1a1a' }}
            type="submit"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span> Sign out
          </button>
        </form>
      </div>
    </div>
  )
}

function PlanCard({
  isCurrent,
  title,
  price,
  priceSuffix,
  highlight,
  actionLabel,
  actionDisabled,
  features,
  onSelect,
}: {
  isCurrent: boolean
  title: string
  price: string
  priceSuffix: string
  highlight: boolean
  actionLabel: string
  actionDisabled?: boolean
  features: string[]
  onSelect: () => void
}) {
  return (
    <div
      className="rounded-xl p-md flex flex-col"
      style={{ background: '#FFFFFF', border: `1.5px solid ${highlight ? '#0D9F6E' : '#D8E2DC'}`, flex: 1 }}
    >
      {highlight && (
        <span
          className="inline-block text-[10px] font-ui-semibold uppercase tracking-wider px-2 py-[2px] rounded-full mb-2 self-start"
          style={{ background: '#D1FAE5', color: '#0D9F6E' }}
        >
          Recommended
        </span>
      )}
      <p className="text-sm font-ui-semibold mb-1" style={{ color: '#1A2620' }}>
        {title}
      </p>
      <p className="mb-md" style={{ color: '#1A2620' }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>{price}</span>
        <span className="text-xs" style={{ color: '#5C6F65' }}>
          {priceSuffix}
        </span>
      </p>
      <ul className="flex flex-col gap-2 mb-lg">
        {features.map((f) => (
          <li className="flex items-start gap-2 text-sm" key={f}>
            <span className="material-symbols-outlined text-[16px] mt-[1px]" style={{ color: '#0D9F6E' }}>
              check
            </span>
            <span style={{ color: '#1A2620' }}>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        {isCurrent ? (
          <span
            className="inline-block text-xs font-ui-semibold px-3 py-1.5 rounded-lg"
            style={{ background: '#EEF2F0', color: '#5C6F65' }}
          >
            Current plan
          </span>
        ) : (
          <button
            className="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors active:scale-95 w-full hover:bg-[#0b8a5f] disabled:opacity-50 disabled:pointer-events-none"
            style={{ background: '#0D9F6E' }}
            type="button"
            disabled={actionDisabled}
            onClick={onSelect}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function PlanTab({ plan, onSwitch }: { plan: Plan; onSwitch: (plan: Plan) => void }) {
  return (
    <div>
      <h3 className="font-display-sm mb-lg" style={{ fontSize: 20, fontWeight: 800, color: '#1A2620' }}>
        Plan
      </h3>
      <div className="flex gap-md" style={{ alignItems: 'stretch' }}>
        <PlanCard
          isCurrent={plan === 'basic'}
          title="Basic"
          price="$0"
          priceSuffix="/mo"
          highlight={false}
          actionLabel="Downgrade"
          features={[
            'Up to 200 notes',
            '1 workspace',
            'Weekly insights',
            'Chat scoped to one insight at a time',
            'Community support',
          ]}
          onSelect={() => onSwitch('basic')}
        />
        <PlanCard
          isCurrent={plan === 'plus'}
          title="Plus"
          price="$10"
          priceSuffix="/mo"
          highlight
          actionLabel="Coming soon"
          actionDisabled
          features={[
            'Unlimited notes',
            'Unlimited workspaces',
            'Daily insights, custom schedule',
            'Ask across your entire vault',
            'Priority support',
          ]}
          onSelect={() => onSwitch('plus')}
        />
      </div>
    </div>
  )
}

function BillingTab() {
  return (
    <div>
      <h3 className="font-display-sm mb-lg" style={{ fontSize: 20, fontWeight: 800, color: '#1A2620' }}>
        Billing
      </h3>
      <div className="mb-xl">
        <p className="font-label-caps text-label-caps mb-sm" style={{ color: '#5C6F65' }}>
          PAYMENT METHOD
        </p>
        <div className="rounded-xl p-md" style={{ background: '#FFFFFF', border: '1px solid #D8E2DC' }}>
          <p className="text-sm" style={{ color: '#5C6F65' }}>
            No payment method on file — you&apos;re on the Free plan.
          </p>
        </div>
      </div>
      <div>
        <p className="font-label-caps text-label-caps mb-sm" style={{ color: '#5C6F65' }}>
          BILLING HISTORY
        </p>
        <div className="rounded-xl p-md" style={{ background: '#FFFFFF', border: '1px solid #D8E2DC' }}>
          <p className="text-sm" style={{ color: '#5C6F65' }}>
            No invoices yet.
          </p>
        </div>
      </div>
    </div>
  )
}
