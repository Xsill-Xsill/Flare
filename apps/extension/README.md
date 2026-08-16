# Flare Chrome Extension

Capture the current page's URL or selected text straight into your Flare Vault, from the
popup or the right-click context menu.

## Requirements

- The Flare Next.js app running and reachable at the URL configured in `config.js`
  (defaults to `http://localhost:3000` for local dev).
- A Flare account (email + password) with at least one workspace.

## Build

From this directory:

```sh
pnpm build
```

Or from the repo root:

```sh
pnpm --filter @flare/extension build
```

This copies the extension's static files into `apps/extension/dist/` — there's no bundler
involved, it's plain ES modules the browser loads directly. `dist/` is gitignored; rebuild
it whenever you change a source file.

To regenerate the placeholder icons (`icons/icon16.png`, `icon48.png`, `icon128.png`):

```sh
pnpm generate-icons
```

## Load into Chrome

1. Run `pnpm build` (see above) so `apps/extension/dist/` exists.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `apps/extension/dist/` folder.
6. Pin the Flare icon to the toolbar if you'd like quick access to the popup.

After editing any source file, re-run `pnpm build` and click the refresh icon on the
extension's card in `chrome://extensions` to pick up the changes.

## Configuring the target deployment

`config.js` exports a single `APP_URL` constant that every API call in the extension uses.
To point the extension at a different Flare deployment (e.g. production instead of
`localhost:3000`):

1. Edit `APP_URL` in `config.js`.
2. Make sure the target host is also listed in `manifest.json`'s `host_permissions`
   (`https://*.flare.app/*` is already included; add another entry if you use a different
   domain).
3. Rebuild (`pnpm build`) and reload the unpacked extension in Chrome.

## How it works

- **Popup** (`popup.html`/`popup.js`) — login form when signed out; otherwise shows the
  current tab's URL, a workspace picker, an optional "include selected text" checkbox, and
  a Save button.
- **Content script** (`content.js`) — runs on every page, watches for text selections, and
  reports them to the background service worker.
- **Background service worker** (`background.js`) — remembers the latest selection (via
  `chrome.storage.local`, so it survives the service worker being unloaded), owns the
  right-click context menu ("Сохранить в Flare"), and can save directly to the API when
  that menu item is used.
- **Auth** — the popup calls `POST {APP_URL}/api/auth/extension` with email/password and
  stores the returned Supabase access token in `chrome.storage.local`. Every subsequent API
  call sends it as `Authorization: Bearer <token>`.

## Manual testing checklist

- Sign in via the popup with a real Flare account.
- Select some text on any page, open the popup, confirm the preview shows (first 100
  chars) and the checkbox is checked.
- Save with the checkbox checked → a `text` item appears in Flare's Inbox with both the
  selection and the source URL.
- Uncheck the box (or don't select anything) → save creates a `url` item instead.
- Switch workspaces in the dropdown, save again, confirm it lands in the new workspace, and
  that the dropdown remembers that choice next time you open the popup.
- Right-click on a page with a selection → "Сохранить в Flare" → confirm the Chrome
  notification and that the item shows up in Flare.
- Right-click on a page with no selection → same, but should save a `url` item.
- Click "Выйти" → popup goes back to the login form; storage no longer has a token.
