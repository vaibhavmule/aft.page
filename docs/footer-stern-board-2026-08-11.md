# Footer stern craft — 2026-08-11

Board: [`../www/footer-stern-board.html`](../www/footer-stern-board.html)

Receipt from in-page Approve / Kill. Implement only **Approve**. Do not invent
outside this list without a new board revision.

## Round 7 — stern craft

Approve: **A Shipping** (`fx-shipping`) — keep live fade + drop-shadow.

Kill: **B Bleed** (`fx-bleed`), **C Stronger** (`fx-stronger`), **E Optical** (`fx-optical`).

Still open: **D Flat** (`fx-flat`), **F Package** (`fx-package`).

## Notes

- Giant stays `aft.` (not `aft.page`). Wordmark chrome stays `aft.page`.
- F packages B+C+D+E. B/C/E are killed, so F cannot ship as written without a new
  board that re-scopes the package (e.g. D-only).
- No `styles.css` change for Approve A — shipping already matches control.

## Implementation

- Ship: none (control retained).
- Do not bleed, strengthen fade, or nudge the square without a new Approve.
- If D is later Approved alone: remove `.footer-giant` `filter: drop-shadow(...)`.
