# aft.page Chrome extension

Adds a **Deploy** button next to HTML code blocks on ChatGPT and Claude.
One click → `POST https://api.aft.page/v1/deploy` → opens `https://{slug}.aft.page`.

No copy. No paste. No account.

## Load unpacked (dev)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (`apps/extension`)
4. Open [chatgpt.com](https://chatgpt.com), ask for an HTML page, click **Deploy**

## Notes

- Only injects on blocks that look like HTML (`<!DOCTYPE html>`, `<html>`, etc.)
- Slug comes from `<title>` / `<h1>` (same as the landing paste UI)
- ChatGPT DOM changes often — if the button doesn’t appear, file an issue and we retarget selectors
