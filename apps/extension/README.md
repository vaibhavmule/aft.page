# aft.page Chrome extension

**GitHub:** **Run on AFT** next to Fork → `POST /v1/repo/deploy` → live URL
(static now, Vite/Next via the job).

**ChatGPT / Claude:** aft icon next to Copy still publishes HTML artifacts.
GitHub repo links in the thread also get **Run on AFT** — not just a share
button.

Header `X-Aft-Client: extension`. Opens the live (or claim) URL. No account.

## Load unpacked (dev)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → this folder (`apps/extension`)
4. **Reload** after edits
5. Refresh GitHub / ChatGPT / Claude

## Check

```bash
node apps/extension/check.mjs
```

## Notes

- ChatGPT and Claude DOMs change often — retarget selectors in `content.js`
- GitHub header also remounts; the injector no-ops if the button is already there
