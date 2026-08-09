# Brand board decisions — 2026-08-08

Board: [`../www/brand-board.html`](../www/brand-board.html)

Receipt from in-page Approve / Kill. Implement only **Approve**. Do not invent
outside this list without a new board revision.

## Approve

- A — Wordmark only (`lockup-wordmark`)
- B — Wordmark + Beta (`lockup-beta`)
- D — Live (green) period (`lockup-green-period`)
- E — Stern compact `aft.` with square period (`lockup-stern`)
- Nav: wordmark + Beta + white CTA (`ctx-nav-beta`)
- Geist sans + mono stack (`type-geist`)
- Footer status pill → status.aft.page (`chrome-status`)

## Kill

- C — Favicon mark + wordmark (`lockup-favicon`)
- F — Status pill with live dot as brand lockup (`lockup-status-pill`)
- Favicon — aft. square period quiet (`fav-stern-quiet`)
- Favicon — aft. square period live (`fav-stern-live`)
- Favicon — a + square (`fav-a-square`)
- Nav: favicon mark + wordmark (`ctx-nav-mark`)
- Primary white CTA + quiet secondary pair as required motif (`cta-pair`)

## Still open

- Core token set (`tokens-core`) — leave tokens as shipped until voted

## Implementation notes

- Wordmark period uses `--good` (D), not muted grey.
- Giant stern watermark uses a square period element (E), not `.`.
- Website nav stays wordmark + Beta + white primary CTA (B, ctx-nav-beta).
- Favicon: all board candidates killed — keep shipped `favicon.svg` until a new
  favicon board revision is approved.
- Do not ship icon+wordmark lockups or a brand “status pill” wordmark.
