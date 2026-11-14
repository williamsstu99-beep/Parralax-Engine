# Backlog

The living to-do list for Dynamic Learning / the Parallax Engine. It is updated with every change: when work starts, an item moves to **In progress**; when it ships, it moves to **Done** with the date and branch, and a line is added to the **Change log** at the bottom.

See `docs/PROGRESS.md` for the full story of what's been built and why.

Last updated: 14 November 2026.

---

## In progress

_Nothing in progress right now._

## Up next

| # | Item | Why | Notes |
|---|---|---|---|
| 1 | Cap arrow lengths in generated scenes | The biggest force arrow can run off screen when forces differ a lot (e.g. heavy vs light ball) | `src/engine/kit/draw.ts` |
| 2 | Improve caption wording in the AI guide | Haiku sometimes writes clumsy captions ("ranged from 10.0 m to 10.0 m") | `src/engine/kit/guide.ts` |
| 3 | Flow module in the toolkit (airflow round a wing, pipe flow) | So the AI can build wing and pipe scenes, not just the hand-built ones | Reuse `wingFlow.ts` and the pipe maths |
| 4 | Link the Studio from the landing page | `/studio` is only reachable by typing the address | |
| 5 | Open a pull request for `claude/engine-toolkit` | Gets the generative engine live | Waiting on go-ahead |
| 6 | Real teacher test set (20 to 50 prompts) | Our 10 test prompts were written by us, not teachers | Need prompts from Auracle |
| 7 | Spending cap on the Anthropic API key | Stops a bug from running up a big bill | Set in the Anthropic console |

## Later

| Item | Notes |
|---|---|
| Library: save, folders, share with a class | Needs a database (Vercel options are free to start) |
| Apply the Studio design to the rest of the app | Home, engine pages, existing hand-built simulations |
| "Pro" option using a stronger model | For teachers who want richer simulations |
| More toolkit modules | Optics, heat, circuits inside the toolkit, geometry |
| Auracle member login (Wix) | Parked by decision; engine becomes a member feature |
| NZ curriculum packages | Ready-made collections mapped to the curriculum |
| Chemistry and biology engines | Same toolkit approach plus their own solvers |
| Delete leftover Vercel projects | Keep only `parralax-engine-1vri` |

## Done

| Date | Item | Branch / PR |
|---|---|---|
| 14 Nov 2026 | Progress log (`docs/PROGRESS.md`) and this backlog | `claude/engine-toolkit` |
| 12 Nov 2026 | Engine toolkit, sandboxed runtime, automatic checker, cheap AI scene generator, `/studio` page, 9 example scenes. 10/10 test prompts working at about 0.1¢ each | `claude/engine-toolkit` |
| 12 Nov 2026 | UI direction chosen: C, Studio (off-white, teal sidebar, dark teal stage, Library) | design canvas |
| 9 Nov 2026 | Auracle logo direction: eye with Bohr orbits, gunmetal iris, navy | design files |
| 4 Nov 2026 | Engine picker landing, fractions sequence, calmer force arrows | PR #8 |
| 4 Nov 2026 | Access code asked for up front instead of bouncing back | PR #6 |
| 3 Nov 2026 | Reimagine bar; whole plane, pipe flow and voltage hill scenes | PR #7 |
| 3 Nov 2026 | Landing opens straight onto the prompt; crisper arrows | PR #5 |
| 2 Nov 2026 | Physics demo: circuits, wing, magnets, induction, battery | PR #4 |
| Oct 2026 | Original app: live lessons, solvers, tutor, voice, access code, Vercel deploy | PR #3 |

---

## Change log

Newest first. One line per change.

- **14 Nov 2026**: Added `docs/PROGRESS.md` and `docs/BACKLOG.md`.
- **12 Nov 2026**: Added the engine toolkit and cheap scene generator (`src/engine/kit/`, `/api/generate`, `/studio`).
- **4 Nov 2026**: Engine picker landing, fractions sequence, calmer arrows (PR #8).
- **4 Nov 2026**: Fixed the access-code bounce (PR #6).
- **3 Nov 2026**: Reimagine and three new scenes (PR #7).
- **3 Nov 2026**: Prompt-first landing, crisper arrows (PR #5).
- **2 Nov 2026**: Five-scene physics demo (PR #4).
- **Oct 2026**: Original lesson engine and deployment (PR #3).
