# Dynamic Learning / Parallax Engine: progress log

A plain-English record of what has been built so far, the decisions behind it, and what comes next.
Last updated: 14 November 2026.

---

## 1. What this is

**Dynamic Learning** is an interactive simulation platform for New Zealand schools (Years 6 to 13), powered by the **Parallax Engine** and intended to sit inside **Auracle**'s member area for teachers.

A teacher describes a concept ("show how the angle of a ramp changes how fast a block slides, Year 10") and gets a live, interactive simulation they can project and play with in class. The core promise: **the AI decides what to show; the engine guarantees the science is right.** No number a student sees comes from the AI.

- **Repository:** `williamsstu99-beep/Parralax-Engine`
- **Live site:** https://parralax-engine-1vri.vercel.app (Vercel project `parralax-engine-1vri`; the other two Vercel projects are leftovers from setup and can be deleted)
- **Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, TypeScript, Anthropic SDK, zod, vitest
- **Access:** a shared access code (the `ACCESS_CODE` environment variable) protects the AI endpoints. Pages open freely; the code is asked for once, inline, the first time a request needs the AI.

---

## 2. Timeline

### Phase 1: the original lesson engine (`claude/initial-app`, merged as PR #3)
- Live lesson generation through `/api/lesson`, streaming progress to the page.
- **Truth / Lens / Spec layers:** deterministic solvers (circuits, motion, populations, a general "model" engine) do the maths; the AI only writes a lesson spec.
- Text tutor (`/api/tutor`) and voice mode.
- Deployed to Vercel with the API key set as a server-side environment variable.
- The access-code gate.

### Phase 2: the physics demo (`claude/physics-demo`, PRs #4 to #8, all merged)
Built for an intermediate-school demo. Hand-crafted, living simulations with plain-English captions and no graphs or clutter:

| Simulation | What it shows |
|---|---|
| Circuits workshop | Build a circuit by dragging parts; current flows live |
| How a wing lifts | Aerofoil in airflow (potential flow with the Kutta condition); speed and tilt change lift; stalls |
| Four forces on a plane | Lift, weight, thrust and drag on a whole aircraft |
| Flow in a pipe | Narrowing pipe, Bernoulli pressure gauges, laminar to turbulent flow |
| Magnets | Draggable magnets, field lines, iron filings, compasses |
| Induction | Magnet through a coil lights a bulb |
| Inside a battery | Galvanic and electrolytic cells, ions and electrons |
| Voltage is a hill | Circuits reimagined as charges rolling down a hill |
| Fractions to decimals | Seven-step sequence from a whole to fraction = division = decimal = percentage |

Also in this phase:
- **Reimagine bar:** ask for the same idea shown another way (wing to plane to pipe; circuit to voltage hill).
- **Engine picker landing page:** Physics and Mathematics live; Circuits, Chemistry and Biology shown as "TBC".
- Requests are routed to the right simulation by keywords first, then a quick AI pick.
- Visual clean-up: fine white engineering-style force arrows instead of neon, calmer outlines, warmer palette.
- Inline access-code step (fixed a bug where the build screen bounced back to the prompt).

### Phase 3: brand and design direction
- **Demo videos** recorded from the real app (a 30 to 50 second cut with zoom-ins on the typed prompts and an Auracle end card).
- **Auracle logo:** many rounds, ending on an eye with Bohr-style electron orbits, a gunmetal iris with a blue ring, softer orbits, on navy (#14253a), with a spaced Montserrat wordmark.
- **UI direction:** three options were mocked up on a design canvas. The chosen direction is **C, Studio**:
  - off-white background (#f6f4ef) with white cards,
  - an Auracle teal sidebar (#0f3f48 to #155660),
  - simulations on a dark teal stage (#0a2a31) with thin white lines and one blue accent (#8ccaff),
  - a **Library** where teachers save, organise into folders, and share simulations with classes.
- **Decision:** the engine should become a feature inside Auracle's existing member login rather than a separate product. (Parked for now; no Wix work yet.)

### Phase 4: the generative engine (`claude/engine-toolkit`, not yet merged)
The hand-built scenes only cover what has been hand-coded. To let the engine build simulations for concepts nobody has coded, we chose a **hybrid approach**:

1. **A toolkit of tested building blocks** (physics, maths and teaching), written and tested by hand.
2. **The AI writes short scene scripts** that only arrange those blocks.
3. **Every script is checked automatically** before anyone sees it, and runs in a locked-down sandbox.

#### Cost decision
The first estimate (using the largest model for everything) came to about US$0.20 to 0.40 per new simulation, which was too expensive. We redesigned around a **cheap-first** approach:
- The fast, cheap model (Claude **Haiku**) writes the scenes. The toolkit does the hard physics, so the AI's job is small.
- The toolkit instructions are cached, so repeat requests pay about a tenth of the price for them.
- Saved and example simulations open for free with no AI call.
- A higher-quality "pro" option (a stronger model) can be added later for teachers who want it.

**Measured result:** on 10 teacher-style test prompts, **10 out of 10 produced working simulations (9 on the first try), averaging about 0.1 US cents each** (about 1 cent for all ten).

---

## 3. How the generative engine works

```
Teacher prompt + year level
        │
        ▼
/api/generate  ── Haiku writes a scene script (toolkit guide cached)
        │        └─ server compiles it WITHOUT running it; blocks forbidden calls
        ▼
Browser: sandboxed iframe (no network; can only load our runtime)
        ├─ validate(): builds and runs the scene headlessly for 8 s
        │     catches crashes, NaN physics, empty scenes, runaway motion
        ├─ failed? errors go back to the AI for one automatic repair
        └─ passed: animate it, send controls and captions to the page
```

### The toolkit (`src/engine/kit/`)

| File | What it does |
|---|---|
| `world.ts` | The physics: real units (m, s, kg, N). Gravity, ground and bounce, air resistance, springs, pendulums (exact period, not the small-angle shortcut), blocks on slopes with friction, mutual gravitation (orbits), charged particles in electric fields. Every body reports its named forces. |
| `core.ts` | The scene runtime and the API scripts use: `world`, `show` (arrows, traces, labels, lines, waves, captions, titles), `ui` (sliders, toggles, choices, step sequences), `maths` (plots, number lines, fraction bars, hundred grids), `fields` (point charges, uniform fields). Plus `validate()`, the automatic checker. |
| `draw.ts` | One renderer that draws every scene in the Studio style, so generated scenes always look on-brand. |
| `sandbox.ts` | The runtime inside the sandboxed frame; bundled to `public/kit/runtime.js` by `npm run kit`. |
| `guide.ts` | What the AI reads: the API, the rules ("never compute physics yourself", "one idea, 1 to 4 controls", plain NZ English) and worked examples. |
| `examples.ts` | Nine hand-written scenes (pendulum, projectile, slope, orbits, spring, electric field, waves, fractions, reading a curve). They open free in the Studio and teach the AI the style. |
| `kit.test.ts` | Physics checked against textbook answers: pendulum period, projectile range, drag, spring energy and period, slope acceleration, static friction, a stable circular orbit. Every example must pass the checker. |

A scene script looks like this:

```js
show.title("Pendulum: period and length");
const length = ui.slider("Length", { min: 0.2, max: 2.5, value: 1, unit: "m" });
world.gravity(9.8);
const p = world.pendulum({ x: 0, y: 0, length, angle: 20 });
show.trace(p.bob, { seconds: 1.2 });
show.caption(() => `One full swing takes ${p.period().toFixed(2)} s.`);
```

The period comes from the engine, never from the AI.

### The Studio (`/studio`)
- Prompt box with a year-level picker, then Build.
- Dark teal simulation stage with a live caption underneath.
- Controls panel built from whatever controls the scene declares.
- "Checked by the engine" note showing the cost of each AI-built scene.
- Example scenes that open instantly for free.

### Security
- Scripts never run on the server; the server only compiles them to check syntax.
- In the browser they run inside an `<iframe sandbox="allow-scripts">` whose content policy only allows our own runtime file: no network, no access to the page, cookies or storage. The page and the frame talk only through messages.
- Common forbidden calls (`fetch`, `document`, `eval`, timers and so on) are rejected before the script reaches the browser.

---

## 4. Running it locally

```bash
npm install
npm run dev      # builds the simulation runtime (npm run kit), then starts Next.js
npm test         # 127 tests
npm run build    # production build (also builds the runtime first)
```

Environment variables (server-side only; never commit them):
- `PARALLAX_ANTHROPIC_API_KEY` (or `ANTHROPIC_API_KEY`): the Anthropic API key
- `ACCESS_CODE`: the shared access code

---

## 5. Known issues

- When a scene has forces of very different sizes, the biggest arrow can run off screen (arrows share one scale). Plan: cap arrow length.
- Haiku's captions are sometimes clumsy (e.g. "ranged from 10.0 m to 10.0 m"). Plan: tune the guide.
- Airflow and pipe flow are not in the toolkit yet, so the wing and pipe exist only as hand-built scenes.
- The test prompts so far were written by us, not real teachers.
- The Studio is not linked from the landing page yet, and the generative engine branch is not merged or live.

---

## 6. What's next

1. **Polish:** cap arrow lengths; improve caption wording in the guide.
2. **Flow module:** bring the wing and pipe physics into the toolkit so the AI can use them.
3. **Library:** save, folders and share-with-class (needs a database; Vercel's options are free to start).
4. **Real test set:** 20 to 50 prompts from real teachers, run after every change to track quality and cost.
5. **Apply the Studio design** to the rest of the app (home, engine pages, existing simulations).
6. **"Pro" option:** a stronger model for teachers who want richer simulations.
7. **Later:** Auracle member login (Wix), NZ curriculum packages, chemistry and biology engines.

---

## 7. Cost reference (US$, November 2026)

| Item | Cost |
|---|---|
| New AI-built simulation (Haiku) | about $0.001 (measured) |
| Opening a saved or example simulation | free |
| Vercel hosting | free now; Pro (about $20/month) once it's used commercially |
| Database for the library | free to start, then about $20 to 25/month |

A monthly spending cap on the API key is recommended so a bug can never run up a large bill.
