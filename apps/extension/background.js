// MV3 service worker (see manifest.json "background": { "type": "module" }).
import { getAuth, getWorkspaceId, setLastSelection } from './storage.js'
import { saveItem } from './api.js'

const CONTEXT_MENU_ID = 'flare-save'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Сохранить в Flare',
    contexts: ['page', 'selection'],
  })
})

// Persist the freshest selection reported by content.js so the popup can show a preview
// of it when it opens, even if the service worker was asleep in between.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'TEXT_SELECTED' && typeof message.text === 'string' && message.text.trim()) {
    setLastSelection({ text: message.text.trim(), url: message.url ?? '', capturedAt: Date.now() })
  }
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.url) return

  const [{ accessToken }, workspaceId] = await Promise.all([getAuth(), getWorkspaceId()])

  if (!accessToken || !workspaceId) {
    notify('Открой попап Flare, войди и выбери workspace, затем повтори попытку.')
    return
  }

  const selectionText = info.selectionText?.trim()
  const payload = selectionText
    ? { workspaceId, type: 'text', rawContent: selectionText, sourceUrl: tab.url }
    : { workspaceId, type: 'url', sourceUrl: tab.url }

  try {
    await saveItem(accessToken, payload)
    notify('Сохранено в Flare')
  } catch (err) {
    console.error('Flare: context menu save failed', err)
    notify('Не удалось сохранить — попробуй через попап Flare.')
  }
})

function notify(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Flare',
    message,
  })
}
