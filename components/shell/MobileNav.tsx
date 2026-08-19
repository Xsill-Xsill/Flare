'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { key: 'home', href: '/dashboard', label: 'Главная', icon: '/assets/images/nav-home.png' },
  { key: 'vault', href: '/vault', label: 'Vault', icon: '/assets/images/nav-vault.png' },
  { key: 'insights', href: '/insights', label: 'Инсайты', icon: '/assets/images/nav-insights.svg' },
  { key: 'settings', href: '/settings', label: 'Настройки', icon: '/assets/images/nav-settings.png' },
]

function activeKeyForPath(pathname: string) {
  const match = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
  return match?.key
}

export function MobileNav({ onAccountClick }: { onAccountClick: () => void }) {
  const pathname = usePathname()
  const activeKey = activeKeyForPath(pathname)

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around bg-white"
      style={{ borderTop: '1.5px solid #D8E2DC', height: 64, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === activeKey
        return (
          <Link
            key={item.key}
            className="flex-1 flex flex-col items-center justify-center gap-[2px]"
            href={item.href}
          >
            {isActive && <span className="w-1 h-1 rounded-full" style={{ background: '#0D9F6E' }} />}
            <Image
              alt={item.label}
              width={20}
              height={20}
              className="w-5 h-5"
              style={{ opacity: isActive ? 1 : 0.6 }}
              src={item.icon}
            />
            <span
              className="font-metadata-mono text-metadata-mono text-[10px]"
              style={{ color: isActive ? '#0D9F6E' : '#5C6F65', fontWeight: isActive ? 700 : 400 }}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
      <button
        className="flex-1 flex flex-col items-center justify-center gap-[2px]"
        type="button"
        onClick={onAccountClick}
      >
        <span className="material-symbols-outlined text-[20px]" style={{ color: '#5C6F65' }}>
          account_circle
        </span>
        <span className="font-metadata-mono text-metadata-mono text-[10px]" style={{ color: '#5C6F65' }}>
          Account
        </span>
      </button>
    </nav>
  )
}
