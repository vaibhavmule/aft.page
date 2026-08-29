# Outside-user trials

**Rule:** People who did **not** build AFT run either `aft deploy` **or** Run from public docs alone. No founder backchannel during the trial.

Need **five genuine trials**. Arbitrary runtime support does not substitute for this scoreboard.

## Instructions for the stranger

1. Use only https://aft.page (install / Run / docs).
2. Pick one:
   - **CLI:** `curl -fsSL https://aft.page/install \| sh` then `aft deploy` in a tiny HTML or Vite folder.
   - **Run:** open https://aft.page/run and paste a public GitHub URL.
3. Stop when you have a live `*.aft.page` URL, or after 20 minutes stuck.

## Scoreboard (five trials)

Record identity, repository, human time-to-URL, whether another human used the app, and whether the creator returns.

| # | Date | Who | Repo or folder | Path | Human T2U | Live URL | Other human used it? | Creator returned? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
| 4 | | | | | | | | | |
| 5 | | | | | | | | | |

`Other human used it?` = someone besides the creator loaded the URL and did a real action (not the founder).
`Creator returned?` = they came back later to update, re-run, or share — not the same session.

## Capture extras (optional, per trial)

| Field | Notes |
| --- | --- |
| Where they stuck | |
| Copy that lied / confused | |
| Would they try again? | yes / no |

## Nested full-stack

Public Run path: a Vite/static UI plus Express/Flask API in `frontend/` +
`backend/` (or equivalent) shares one `*.aft.page` URL. Record what a stranger's
nested repo actually did in Notes. A fixture does not substitute for that row.

## Status

- **2026-08-29:** Run engine is stranger-ready enough (Express fixture HTTP 200; same hostname recovers after origin expire). **0 / 5 trials recorded.** Founder still must send one person who did not build AFT to https://aft.page/run. Do not invent identities. Do not start chat surfaces, general connectors, workflows, or AFT Cron.
