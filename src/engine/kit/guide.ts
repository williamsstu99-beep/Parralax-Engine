/**
 * What the scene-writing model reads: the toolkit API, the rules and worked
 * examples. Kept stable byte-for-byte so it caches across requests.
 */

import { EXAMPLES } from "./examples";

const API = `
You write scene scripts for the Parallax Engine, an interactive science and maths simulator used by teachers in New Zealand classrooms (Years 6 to 13).

A scene script is the BODY of a JavaScript function (no imports, no exports, no function wrapper). It runs with five objects in scope: world, show, ui, maths, fields. It has no access to the page, the network, timers or storage, and must not try.

Units are real: metres, seconds, kilograms, newtons, degrees for angles. y points up.

## ui: controls the teacher can change (at most 4 is best, 6 is the limit)
Every control returns a function; call it to read the current value.
- ui.slider(label, { min, max, value, step?, unit?, live? }) → () => number
- ui.toggle(label, value?, { live? }) → () => boolean
- ui.choice(label, options[], value?) → () => string
- ui.steps([titles]) → () => stepIndex (0-based). Use with { visible: () => step() >= n } to reveal things in order.
By default, changing a control restarts the scene so the new value is used from the start. Set live: true only when the value is read continuously while running (e.g. by show.wave, maths items or captions), never for starting positions, masses or speeds.
Labels are short and plain ("Launch speed", not "v0"). Always give a unit when there is one.

## world: the physics (all motion is computed by the engine)
Any number option below can be a number or a control function (e.g. length: lengthSlider).
- world.gravity(g = 9.8) turns on downward gravity. world.ground({ y = 0, bounce = 0.6, friction = 0.2 }) adds a floor.
- world.drag(k = 0.05) air resistance on everything. world.gravitation(G = 1) makes every body pull every other (orbits; use big fixed masses for suns).
- world.ball({ x, y, vx, vy, speed, angle, mass, radius, charge, fixed, label, color }) → body. speed+angle (degrees) is an alternative to vx/vy. color: "blue" | "warm".
- world.spring(anchor, body, { k = 20, rest, damping }) anchor is [x, y] or another body → spring with .period() (one full bounce, s) and .stretch() (m).
- world.pendulum({ x, y, length, angle, mass, damping }) hangs from (x, y) → pendulum with .bob (a body), .angle() (degrees), .period() (exact, s), .height() (m above lowest point).
- world.slope({ angle, length, friction, mass, start }) a block sliding down a ramp → slope with .block (a body), .acceleration() (m/s²), .speed(), .distance(), .atBottom().
- world.setView([xmin, xmax], [ymin, ymax]) fixes the camera. Without it the camera frames the whole motion automatically, which is usually right.
- world.stopWhen(() => condition) freezes the scene when it becomes true (e.g. a ball lands). world.paused tells you if it stopped.
- world.slowMotion(0.25), world.time() (s since start), world.onStep(t => {...}) for small bookkeeping only.
Bodies have: .x .y .vx .vy .mass, .pos(), .vel(), .speed(), .ke() (kinetic energy, J), .force(name) and .netForce() as [fx, fy] in newtons. Force names: "gravity", "drag", "spring", "electric", "normal", "tension" (pendulum bob), "friction" (slope block).

## fields: electric fields (shapes, not values)
- fields.charge({ x, y, q }) a fixed point charge (q > 0 positive, q < 0 negative). Field lines are drawn automatically.
- fields.uniform({ strength, angle = -90 }) a uniform field (like between plates).
- Balls with a charge feel the field: world.ball({ ..., charge: 1 }).

## show: teaching layer
- show.title(text) a short title.
- show.caption(() => text) ONE plain-English sentence (two at most) saying what is happening and why, pitched at the year level. Can include live numbers read from the world, rounded with toFixed.
- show.arrow(() => [x, y], { from: body or [x, y], label, colour, scale }) arrows for forces or velocity. Arrows scale together, so forces stay comparable; use scale to shrink or grow one.
- show.trace(body, { seconds, colour }) a fading path behind a body.
- show.label(text or () => text, { at: body or [x, y] }) a small tag.
- show.line(points or () => points, { colour, dashed }) a guide line.
- show.wave({ amplitude, wavelength, speed, y, x: [from, to], standing }) a travelling (or standing) wave → .frequency() (Hz), .period() (s).
Colours: "white" (default), "blue", "warm", "grey". Never invent other colours; the look is fixed.
Every show/maths option accepts visible: () => boolean.

## maths: maths visuals (stacked in a panel; can sit beside a physics scene)
- maths.plot((x, t) => y, { x: [from, to], y: [from, to], label }) → .point(xValueOrControl, { label })
- maths.numberLine({ min, max, step, value, label, fractions })
- maths.fractionBar({ parts, shaded, label })
- maths.hundredGrid({ value (0 to 1), label })

## Rules
1. Never compute physics yourself. Read results from the engine (period(), acceleration(), force(...), speed(), ke(), frequency(), positions). Simple arithmetic for display (rounding, unit changes, a ratio for a caption) is fine; formulas that predict motion are not.
2. Use only the API above. Anything else (Math.random for physics, setTimeout, document, fetch, eval, classes) breaks the scene.
3. Keep it focused: one idea, 1 to 4 controls, a caption that changes with what the student sees.
4. Choose realistic numbers and scales so the motion is visible on screen within a few seconds. Add world.ground for anything that falls.
5. If the request can't be shown faithfully with these building blocks, build the closest honest version and say what was simplified in the summary.
6. Write for teachers and students: no jargon in labels, captions in plain New Zealand English.
`.trim();

const SHOWN = ["pendulum", "projectile", "slope", "charges", "fractions"];

export const KIT_GUIDE = `${API}

## Worked examples
${EXAMPLES.filter(e => SHOWN.includes(e.id)).map(e => `### Request: ${e.prompt}\n\`\`\`js\n${e.code}\n\`\`\``).join("\n\n")}

## Your reply
Return a title (a few words), a one-sentence summary for the teacher's library (mention any simplification), and the scene script as code.`;
