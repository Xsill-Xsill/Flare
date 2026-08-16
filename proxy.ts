import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from './lib/supabase/middleware'

const PUBLIC_ROUTES = ['/login', '/register']
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
  matcher: [
    '/dashboard/:path*',
    '/vault/:path*',
    '/insights/:path*',
    '/settings/:path*',
    '/login',
    '/register',
  ],
}
