# aft.page Chrome extension

Adds an **aft icon** beside Copy on ChatGPT / Claude artifact headers, plus
**Deploy to aft.page** inside Claude's Copy dropdown (next to Download as HTML).

One click → `POST https://api.aft.page/v1/deploy` (header `X-Aft-Client: extension`)
→ opens the **preview shell**:
`https://aft.page/preview?url=https://{slug}.aft.page`
(live site remains `https://{slug}.aft.page`).

No copy. No paste. No account.

## Load unpacked (dev)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (`apps/extension`)
4. Click **Reload** after updates
5. Refresh ChatGPT / Claude
6. Look for the terracotta **a.** icon next to Copy (or the dropdown item on Claude)

## Notes

- Icon has no text label in the DOM (avoids scraping `Deploy` into published HTML)
- Rescans after fullscreen / minimize / resize — Claude remounts the artifact chrome
- Slug hint comes from `<title>` / `<h1>` client-side (passed as `?slug=`) — same as the landing paste UI
- ChatGPT and Claude DOMs change often — if the icon disappears, retarget selectors in `content.js`
