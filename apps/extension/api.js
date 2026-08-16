// Thin fetch wrappers around the Flare API, shared by background.js and popup.js.

import { APP_URL } from './config.js'

async function parseJsonSafe(res) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

export async function login(email, password) {
  const res = await fetch(`${APP_URL}/api/auth/extension`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await parseJsonSafe(res)
  if (!res.ok) throw new Error(body.error || 'Не удалось войти')
  return body // { access_token, user_id }
}

export async function listWorkspaces(accessToken) {
  const res = await fetch(`${APP_URL}/api/v1/workspaces`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await parseJsonSafe(res)
  if (!res.ok) throw new Error(body.error || 'Не удалось загрузить workspaces')
  return body
}

export async function saveItem(accessToken, payload) {
  const res = await fetch(`${APP_URL}/api/v1/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await parseJsonSafe(res)
  if (!res.ok) throw new Error(body.error || 'Не удалось сохранить')
  return body
}
