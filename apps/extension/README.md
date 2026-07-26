# aft.page Chrome extension

Adds a **Deploy** button next to HTML code blocks on ChatGPT. In Claude's
artifact editor, it adds **Deploy to aft.page** to the existing Copy dropdown,
beside **Download as HTML** and **Publish artifact**.

One click → `POST https://api.aft.page/v1/deploy` → opens
`https://{slug}.aft.page`.

No copy. No paste. No account.

## Load unpacked (dev)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (`apps/extension`)
4. Reload ChatGPT / Claude after loading or updating the extension
5. On ChatGPT, click **Deploy** beside the HTML block
6. On Claude, open Copy's dropdown and click **Deploy to aft.page**

## Notes

- Only deploys content that looks like HTML (`<!DOCTYPE html>`, `<html>`, etc.)
- Slug comes from `<title>` / `<h1>` (same as the landing paste UI)
- Claude's artifact editor is read from CodeMirror, with Monaco and `<pre>`
  fallbacks.
- ChatGPT and Claude DOMs change often — if the button doesn’t appear, retarget
  the selectors in `content.js`.
