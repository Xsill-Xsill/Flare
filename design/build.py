#!/usr/bin/env python3
"""
Sync shared components (sidebar, account modal, nav-active script) from
design/partials/ into the 4 static prototype pages.

Why this exists: these pages are plain HTML with no build step, so the
sidebar and account modal used to be copy-pasted into all 4 files. Any
edit had to be repeated by hand 4 times (and once already drifted out of
sync). This script makes the partials/ folder the single source of truth
— edit a partial, run this script, all 4 pages update.

Usage:
    python3 design/build.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).parent
PARTIALS = ROOT / "partials"

PAGES = {
    "home_page.html": "home",
    "vault_page.html": "vault",
    "insights_page.html": "insights",
    "settings_page.html": "settings",
}

SIDEBAR_RE = re.compile(r"<!-- SideNavBar \(Shared Component\) -->.*?</nav>", re.S)
MODAL_HTML_RE = re.compile(r"<!-- ACCOUNT MODAL -->\n.*?\n</div>\n</div>\n</div>\n", re.S)
MODAL_JS_RE = re.compile(
    r"\(function \(\) \{\s*\n\s*var trigger = document\.getElementById\('account-menu-trigger'\);.*?updatePlanLabel\(\);\s*\n\s*\}\)\(\);\n",
    re.S,
)
NAV_ACTIVE_BLOCK_RE = re.compile(
    r"<!-- NAV-ACTIVE-JS -->\n<script>.*?</script>\n", re.S
)
MOBILE_NAV_RE = re.compile(
    r"<!-- Mobile bottom tab bar.*?</nav>", re.S
)
BODY_TAG_RE = re.compile(r"<body\b[^>]*>")

# Old, pre-partial sidebar collapse script (still literally inline in each
# page the first time this migration runs). Matched by its stable prefix/
# suffix so we can find-and-replace it even before any marker comment exists.
SIDEBAR_BEHAVIOR_OLD_RE = re.compile(
    r"\(function \(\) \{\s*\n\s*var sidebar = document\.getElementById\('sidebar'\);.*?setCollapsed\(localStorage\.getItem\(STORAGE_KEY\) === '1'\);\s*\n\s*\}\)\(\);\n",
    re.S,
)
SIDEBAR_BEHAVIOR_BLOCK_RE = re.compile(
    r"<!-- SIDEBAR-BEHAVIOR-JS -->\n<script>.*?</script>\n", re.S
)
HEAD_FONTS_RE = re.compile(r"<style>\s*\n\s*@font-face \{.*?</style>\n", re.S)
TAILWIND_CONFIG_RE = re.compile(
    r'<script id="tailwind-config">.*?</script>', re.S
)
TOAST_HTML_RE = re.compile(r"<!-- TOAST -->\n.*?</div>\n", re.S)
TOAST_JS_BLOCK_RE = re.compile(r"<!-- TOAST-JS -->\n<script>.*?</script>\n", re.S)


def load(name):
    return (PARTIALS / name).read_text()


def set_data_page(html, page_key):
    def repl(m):
        tag = m.group(0)
        if "data-page=" in tag:
            return re.sub(r'data-page="[^"]*"', f'data-page="{page_key}"', tag)
        return tag[:-1] + f' data-page="{page_key}">'

    new_html, n = BODY_TAG_RE.subn(repl, html, count=1)
    if n == 0:
        raise SystemExit("No <body> tag found")
    return new_html


def sync_sidebar(html, sidebar_partial):
    new_html, n = SIDEBAR_RE.subn(lambda m: sidebar_partial, html, count=1)
    if n == 0:
        raise SystemExit("Sidebar block not found (marker comment missing?)")
    return new_html


def sync_modal_html(html, modal_html_partial):
    new_html, n = MODAL_HTML_RE.subn(lambda m: modal_html_partial, html, count=1)
    if n == 0:
        raise SystemExit("Account modal HTML block not found")
    return new_html


def sync_modal_js(html, modal_js_partial):
    new_html, n = MODAL_JS_RE.subn(lambda m: modal_js_partial, html, count=1)
    if n == 0:
        raise SystemExit("Account modal JS block not found")
    return new_html


def sync_nav_active_js(html, nav_active_partial):
    block = f"<!-- NAV-ACTIVE-JS -->\n<script>\n{nav_active_partial}</script>\n"
    if NAV_ACTIVE_BLOCK_RE.search(html):
        return NAV_ACTIVE_BLOCK_RE.sub(lambda m: block, html, count=1)
    # First run: insert right before </body>
    idx = html.rfind("</body>")
    if idx == -1:
        raise SystemExit("No </body> tag found")
    return html[:idx] + block + html[idx:]


def sync_sidebar_behavior(html, sidebar_behavior_partial):
    block = f"<!-- SIDEBAR-BEHAVIOR-JS -->\n<script>\n{sidebar_behavior_partial}</script>\n"
    if SIDEBAR_BEHAVIOR_BLOCK_RE.search(html):
        return SIDEBAR_BEHAVIOR_BLOCK_RE.sub(lambda m: block, html, count=1)
    # First run: the old IIFE lives inline inside a <script> tag shared with
    # other page-specific IIFEs, so the block (which brings its own <script>
    # tags) must close the shared tag before it and reopen one after, or the
    # result is invalid nested <script> tags.
    wrapped_block = f"</script>\n{block}<script>\n"
    new_html, n = SIDEBAR_BEHAVIOR_OLD_RE.subn(lambda m: wrapped_block, html, count=1)
    if n == 0:
        raise SystemExit("Sidebar behavior script not found (old or marked)")
    return new_html


def sync_head_fonts(html, head_fonts_partial):
    new_html, n = HEAD_FONTS_RE.subn(lambda m: head_fonts_partial, html, count=1)
    if n == 0:
        raise SystemExit("Head fonts <style> block not found")
    return new_html


def sync_tailwind_config(html, tailwind_config_partial):
    block = f'<script id="tailwind-config">\n{tailwind_config_partial}    </script>'
    new_html, n = TAILWIND_CONFIG_RE.subn(lambda m: block, html, count=1)
    if n == 0:
        raise SystemExit("tailwind-config <script> block not found")
    return new_html


def sync_toast(html, toast_html_partial, toast_js_partial):
    if TOAST_HTML_RE.search(html):
        html = TOAST_HTML_RE.sub(lambda m: toast_html_partial, html, count=1)
    else:
        idx = html.rfind("</body>")
        if idx == -1:
            raise SystemExit("No </body> tag found for toast HTML insertion")
        html = html[:idx] + toast_html_partial + "\n" + html[idx:]

    js_block = f"<!-- TOAST-JS -->\n<script>\n{toast_js_partial}</script>\n"
    if TOAST_JS_BLOCK_RE.search(html):
        html = TOAST_JS_BLOCK_RE.sub(lambda m: js_block, html, count=1)
    else:
        idx = html.rfind("</body>")
        if idx == -1:
            raise SystemExit("No </body> tag found for toast JS insertion")
        html = html[:idx] + js_block + html[idx:]
    return html


def sync_mobile_nav(html, mobile_nav_partial):
    if MOBILE_NAV_RE.search(html):
        return MOBILE_NAV_RE.sub(lambda m: mobile_nav_partial, html, count=1)
    # First run: insert right after the sidebar's closing </nav>
    m = SIDEBAR_RE.search(html)
    if not m:
        raise SystemExit("Sidebar block not found, cannot place mobile nav")
    idx = m.end()
    return html[:idx] + "\n" + mobile_nav_partial + html[idx:]


def main():
    sidebar_partial = load("sidebar.html")
    sidebar_behavior_partial = load("sidebar-behavior.js")
    modal_html_partial = load("account-modal.html")
    modal_js_partial = load("account-modal.js")
    nav_active_partial = load("nav-active.js")
    mobile_nav_partial = load("mobile-nav.html")
    head_fonts_partial = load("head-fonts.html")
    tailwind_config_partial = load("tailwind-config.js")
    toast_html_partial = load("toast.html")
    toast_js_partial = load("toast.js")

    for filename, page_key in PAGES.items():
        path = ROOT / filename
        html = path.read_text()

        html = set_data_page(html, page_key)
        html = sync_head_fonts(html, head_fonts_partial)
        html = sync_tailwind_config(html, tailwind_config_partial)
        html = sync_sidebar(html, sidebar_partial)
        html = sync_sidebar_behavior(html, sidebar_behavior_partial)
        html = sync_mobile_nav(html, mobile_nav_partial)
        html = sync_modal_html(html, modal_html_partial)
        html = sync_modal_js(html, modal_js_partial)
        html = sync_nav_active_js(html, nav_active_partial)
        html = sync_toast(html, toast_html_partial, toast_js_partial)

        path.write_text(html)
        print(f"synced {filename} (data-page={page_key})")


if __name__ == "__main__":
    main()
