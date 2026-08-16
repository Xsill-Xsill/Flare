// Thin wrappers around chrome.storage.local, shared by background.js and popup.js.
// We deliberately use storage.local (not storage.session) so the user stays signed in
// across browser restarts.

export const STORAGE_KEYS = {
  accessToken: 'flare_access_token',
  userId: 'flare_user_id',
  workspaceId: 'flare_workspace_id',
  lastSelection: 'flare_last_selection',
}

export async function getAuth() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.accessToken, STORAGE_KEYS.userId])
  return {
    accessToken: stored[STORAGE_KEYS.accessToken] ?? null,
    userId: stored[STORAGE_KEYS.userId] ?? null,
  }
}

export async function setAuth(accessToken, userId) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.accessToken]: accessToken,
    [STORAGE_KEYS.userId]: userId,
  })
}

export async function clearAuth() {
  await chrome.storage.local.remove([STORAGE_KEYS.accessToken, STORAGE_KEYS.userId])
}

export async function getWorkspaceId() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.workspaceId)
  return stored[STORAGE_KEYS.workspaceId] ?? null
}

export async function setWorkspaceId(workspaceId) {
  await chrome.storage.local.set({ [STORAGE_KEYS.workspaceId]: workspaceId })
}

export async function getLastSelection() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.lastSelection)
  return stored[STORAGE_KEYS.lastSelection] ?? null
}

export async function setLastSelection(selection) {
  await chrome.storage.local.set({ [STORAGE_KEYS.lastSelection]: selection })
}
