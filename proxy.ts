import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

// Auth pages: an already-authenticated user is redirected away from these to /dashboard.
// (There's no /signup or /auth/callback route in this app — /register is the actual sign-up
// page, and auth is email/password via Supabase SSR, not an OAuth redirect flow.)
const PUBLIC_ROUTES = ['/login', '/register']
// Everything under app/(app)/ — the authenticated part of the product.
const PROTECTED_PREFIX = ['/dashboard', '/vault', '/insights', '/settings']

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r))
  const isProtected = PROTECTED_PREFIX.some(r => pathname.startsWith(r))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // Runs on every request except static assets and Next's own image optimizer — matches the
  // broad "run everywhere except statics" convention instead of an explicit protected-path
  // allowlist, so a new route under app/(app)/ is covered without a matcher update.
  // /api/auth/extension (and every other API route) is intentionally left unauthenticated
  // here: API routes do their own auth.getUser() check per-route (see CLAUDE.md's ownerId
  // rule) rather than relying on this cookie-based redirect, which wouldn't make sense for a
  // bearer-token API client like the Chrome extension anyway.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
