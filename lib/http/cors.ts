import { NextRequest, NextResponse } from 'next/server'

// The Flare Chrome extension calls the API from a chrome-extension:// origin, which the
// browser treats as cross-origin. Extension IDs vary per install/dev build, so we allow any
// chrome-extension:// origin rather than hardcoding one.
const EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\//

function resolveAllowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin')
  return origin && EXTENSION_ORIGIN_PATTERN.test(origin) ? origin : null
}

/** Adds CORS headers to a response when the request came from the Flare extension. */
export function applyCors(req: NextRequest, res: NextResponse): NextResponse {
  const allowedOrigin = resolveAllowedOrigin(req)
  if (allowedOrigin) {
    res.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    res.headers.set('Vary', 'Origin')
  }
  return res
}

/** Handles the CORS preflight OPTIONS request browsers send before the real one. */
export function preflightResponse(req: NextRequest): NextResponse {
  const allowedOrigin = resolveAllowedOrigin(req)
  const res = new NextResponse(null, { status: allowedOrigin ? 204 : 403 })
  if (allowedOrigin) {
    res.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.headers.set('Access-Control-Max-Age', '86400')
    res.headers.set('Vary', 'Origin')
  }
  return res
}
