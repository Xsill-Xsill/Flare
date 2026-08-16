// Runs on every page (see manifest.json content_scripts). Classic script (no ES module)
// so it stays compatible everywhere without extra manifest config — it only needs to
// forward one message type, so there's nothing worth sharing with background.js here.
;(() => {
  const MESSAGE_TYPE = 'TEXT_SELECTED'

  function reportSelection() {
    const text = window.getSelection()?.toString().trim() ?? ''
    if (!text) return
    chrome.runtime.sendMessage({ type: MESSAGE_TYPE, text, url: window.location.href })
  }

  // mouseup covers drag-to-select; keyup covers shift+arrow / shift+home / shift+end selection.
  document.addEventListener('mouseup', reportSelection)
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey) reportSelection()
  })
})()
