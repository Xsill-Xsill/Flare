import { getAuth, setAuth, clearAuth, getWorkspaceId, setWorkspaceId, getLastSelection } from './storage.js'
import { login, listWorkspaces, saveItem } from './api.js'

const SELECTION_MAX_AGE_MS = 10 * 60 * 1000 // ignore stale selections from a previous page/tab

const loginView = document.getElementById('login-view')
const mainView = document.getElementById('main-view')
const loginForm = document.getElementById('login-form')
const loginEmail = document.getElementById('login-email')
const loginPassword = document.getElementById('login-password')
const loginSubmit = document.getElementById('login-submit')
const loginError = document.getElementById('login-error')

const workspaceSelect = document.getElementById('workspace-select')
const pageUrlEl = document.getElementById('page-url')
const selectionBlock = document.getElementById('selection-block')
const selectionCheckbox = document.getElementById('selection-checkbox')
const selectionPreview = document.getElementById('selection-preview')
const saveButton = document.getElementById('save-button')
const saveStatus = document.getElementById('save-status')
const logoutButton = document.getElementById('logout-button')

let currentTabUrl = ''
let selectionText = ''

function show(el) {
  el.classList.remove('hidden')
}
function hide(el) {
  el.classList.add('hidden')
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function setStatus(message, kind) {
  saveStatus.textContent = message
  saveStatus.className = `status ${kind}`
  show(saveStatus)
}

async function init() {
  const { accessToken } = await getAuth()
  if (!accessToken) {
    show(loginView)
    hide(mainView)
    return
  }
  hide(loginView)
  show(mainView)
  await initMainView(accessToken)
}

async function initMainView(accessToken) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  currentTabUrl = tab?.url ?? ''
  pageUrlEl.textContent = currentTabUrl || 'Не удалось определить URL страницы'

  const lastSelection = await getLastSelection()
  const isFreshForThisTab =
    lastSelection?.text &&
    lastSelection.url === currentTabUrl &&
    Date.now() - lastSelection.capturedAt < SELECTION_MAX_AGE_MS

  if (isFreshForThisTab) {
    selectionText = lastSelection.text
    selectionPreview.textContent = selectionText.length > 100 ? `${selectionText.slice(0, 100)}…` : selectionText
    selectionCheckbox.checked = true
    show(selectionBlock)
  } else {
    selectionText = ''
    hide(selectionBlock)
  }

  await loadWorkspaces(accessToken)
}

async function loadWorkspaces(accessToken) {
  workspaceSelect.innerHTML = '<option>Загрузка…</option>'
  workspaceSelect.disabled = true
  try {
    const workspaces = await listWorkspaces(accessToken)
    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      workspaceSelect.innerHTML = '<option value="">Нет workspace</option>'
      return
    }

    workspaceSelect.innerHTML = workspaces.map((w) => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('')

    const savedWorkspaceId = await getWorkspaceId()
    const hasSaved = savedWorkspaceId && workspaces.some((w) => w.id === savedWorkspaceId)
    workspaceSelect.value = hasSaved ? savedWorkspaceId : workspaces[0].id
    if (!hasSaved) await setWorkspaceId(workspaceSelect.value)
  } catch (err) {
    workspaceSelect.innerHTML = '<option value="">Ошибка загрузки</option>'
    console.error('Flare popup: failed to load workspaces', err)
  } finally {
    workspaceSelect.disabled = false
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  hide(loginError)
  loginSubmit.disabled = true
  loginSubmit.textContent = 'Входим…'
  try {
    const { access_token: accessToken, user_id: userId } = await login(loginEmail.value.trim(), loginPassword.value)
    await setAuth(accessToken, userId)
    hide(loginView)
    show(mainView)
    await initMainView(accessToken)
  } catch (err) {
    loginError.textContent = err instanceof Error ? err.message : 'Не удалось войти'
    show(loginError)
  } finally {
    loginSubmit.disabled = false
    loginSubmit.textContent = 'Войти'
  }
})

logoutButton.addEventListener('click', async () => {
  await clearAuth()
  loginEmail.value = ''
  loginPassword.value = ''
  hide(mainView)
  show(loginView)
})

workspaceSelect.addEventListener('change', () => {
  if (workspaceSelect.value) setWorkspaceId(workspaceSelect.value)
})

saveButton.addEventListener('click', async () => {
  const { accessToken } = await getAuth()
  if (!accessToken) {
    show(loginView)
    hide(mainView)
    return
  }

  const workspaceId = workspaceSelect.value
  if (!workspaceId) {
    setStatus('Выбери workspace', 'error')
    return
  }

  const includeSelection = !selectionBlock.classList.contains('hidden') && selectionCheckbox.checked && Boolean(selectionText)
  const payload = includeSelection
    ? { workspaceId, type: 'text', rawContent: selectionText, sourceUrl: currentTabUrl }
    : { workspaceId, type: 'url', sourceUrl: currentTabUrl }

  saveButton.disabled = true
  saveButton.textContent = 'Сохраняем…'
  hide(saveStatus)

  try {
    await saveItem(accessToken, payload)
    saveButton.textContent = '✓ Сохранено'
    setStatus('Сохранено в Flare', 'success')
  } catch (err) {
    saveButton.textContent = 'Сохранить в Flare'
    saveButton.disabled = false
    setStatus(err instanceof Error ? err.message : 'Не удалось сохранить', 'error')
  }
})

init()
