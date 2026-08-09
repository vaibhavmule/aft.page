# Footer board decisions — 2026-08-09

Board: [`../www/footer-board.html`](../www/footer-board.html)

Receipt from in-page Approve / Kill. Implement only **Approve**. Do not invent
outside this list without a new board revision.

## Round 1 — structure

Approve: A shipped stern.

## Round 2 — wordmark shape

Approve: zinc giant + **B square chrome**.  
Kill: quiet / bold giant, live-green giant square.

## Round 3 — mark effects

Approve: **A flat**.  
Kill: neon giant, neon chrome, gradient chrome, unmatched gradient giant.

## Round 4 — matched gradient

Approve: **A flat** (`fx-flat`).  
Kill: **B matched gradient giant** (`fx-grad-match`) — fading ramp to void.

## Round 5 — new craft

Approve: **A flat** (`fx-flat`), **E print offset** (`fx-offset`).  
Kill: outline, dither, scanlines.

## Round 6 — visible hold

Approve: **A fade** (`fx-flat`) — shipping wash into void.  
Kill: solid zinc, hold gradient, hold + print offset, horizontal sheen.

R5 print offset is superseded: R6 did not approve offset. Do not ship it.

## Implementation notes

- Shipping: structure A, square chrome, fade giant (`styles.css` `.footer-giant`).
- `footer.js` injects that chrome. No new mark craft.
- Do not ship neon, chrome gradients, outline, dither, scanlines, solid fill,
  hold, sheen, or print offset without a new board.
