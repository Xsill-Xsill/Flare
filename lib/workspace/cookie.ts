export const ACTIVE_WORKSPACE_COOKIE = 'active_workspace_id'

export const ACTIVE_WORKSPACE_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax' as const,
}
