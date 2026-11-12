/**
 * Hand-written scene scripts. They prove the toolkit, open instantly for free
 * in the gallery, and are the examples the AI learns the style from.
 */

export interface Example { id: string; title: string; engine: "physics" | "maths"; prompt: string; code: string }

export const EXAMPLES: Example[] = [
  {
    id: "pendulum", title: "Pendulum: period and length", engine: "physics",
    prompt: "Year 11: how does the length of a pendulum change its period?",
    code: `show.title("Pendulum: period and length");
const length = ui.slider("Length", { min: 0.2, max: 2.5, value: 1, unit: "m" });
const angle = ui.slider("Release angle", { min: 5, max: 70, value: 20, unit: "°" });
world.gravity(9.8);
const p = world.pendulum({ x: 0, y: 0, length, angle });
show.trace(p.bob, { seconds: 1.2 });
show.arrow(() => p.bob.vel(), { from: p.bob, label: "Velocity", colour: "blue" });
show.caption(() => \`A \${length().toFixed(1)} m pendulum takes \${p.period().toFixed(2)} s for one full swing. Longer pendulums swing more slowly.\`);`,
  },
  {
    id: "projectile", title: "Projectile motion", engine: "physics",
    prompt: "Year 10: how do launch speed and angle change how far a ball travels?",
    code: `show.title("Projectile motion");
const speed = ui.slider("Launch speed", { min: 5, max: 30, value: 18, unit: "m/s" });
const angle = ui.slider("Launch angle", { min: 10, max: 80, value: 45, unit: "°" });
const air = ui.toggle("Air resistance", false, { live: false });
world.gravity(9.8).ground({ bounce: 0 });
if (air()) world.drag(0.02);
const ball = world.ball({ x: 0, y: 0.15, speed, angle, radius: 0.15 });
world.stopWhen(() => world.time() > 0.2 && ball.y <= 0.151);
show.trace(ball, { seconds: 10 });
show.arrow(() => ball.vel(), { from: ball, label: "Velocity", colour: "blue" });
show.arrow(() => ball.force("gravity"), { from: ball, label: "Weight", scale: 0.6 });
show.caption(() => world.paused
  ? \`It landed \${ball.x.toFixed(1)} m away after \${world.time().toFixed(1)} s in the air.\`
  : "Gravity pulls down the whole time, so the path curves into a parabola.");`,
  },
  {
    id: "slope", title: "Forces on a slope", engine: "physics",
    prompt: "Year 11: show the forces on a block sliding down a ramp with friction",
    code: `show.title("Forces on a slope");
const angle = ui.slider("Slope angle", { min: 5, max: 60, value: 30, unit: "°" });
const friction = ui.slider("Friction", { min: 0, max: 0.8, value: 0.2 });
world.gravity(9.8);
const s = world.slope({ angle, friction, length: 4, mass: 2 });
show.arrow(() => s.block.force("gravity"), { from: s.block, label: "Weight" });
show.arrow(() => s.block.force("normal"), { from: s.block, label: "Normal", colour: "grey" });
show.arrow(() => s.block.force("friction"), { from: s.block, label: "Friction", colour: "warm" });
show.caption(() => s.atBottom() ? "The block has reached the bottom of the slope."
  : s.acceleration() > 0 ? \`The block speeds up at \${s.acceleration().toFixed(1)} m/s²: the pull down the slope beats friction.\`
  : "Friction is strong enough to hold the block still.");`,
  },
  {
    id: "orbit", title: "Orbits", engine: "physics",
    prompt: "Year 12: why do planets orbit instead of falling into the Sun?",
    code: `show.title("Orbits");
const speed = ui.slider("Planet speed", { min: 0.6, max: 1.35, value: 1, step: 0.01, unit: "× circular" });
world.gravitation(1);
world.ball({ x: 0, y: 0, mass: 1000, radius: 0.6, fixed: true, color: "warm", label: "Sun" });
const planet = world.ball({ x: 10, y: 0, vy: 10 * speed(), mass: 1, radius: 0.3, color: "blue", label: "Planet" });
show.trace(planet, { seconds: 9 });
show.arrow(() => planet.force("gravity"), { from: planet, label: "Gravity", colour: "warm" });
show.arrow(() => planet.vel(), { from: planet, label: "Velocity", colour: "blue" });
show.caption(() => speed() < 0.98 ? "Too slow for a circle: gravity pulls the planet into a stretched ellipse."
  : speed() > 1.02 ? "Faster than circular: the planet swings out wide before gravity pulls it back."
  : "Just the right speed: gravity keeps bending the path into a circle, so the planet never falls in.");`,
  },
  {
    id: "spring", title: "Mass on a spring", engine: "physics",
    prompt: "Year 12: simple harmonic motion of a mass on a spring",
    code: `show.title("Mass on a spring");
const k = ui.slider("Spring stiffness", { min: 5, max: 80, value: 20, unit: "N/m" });
const m = ui.slider("Mass", { min: 0.2, max: 3, value: 1, unit: "kg" });
world.gravity(9.8);
const mass = world.ball({ x: 0, y: -1.6, mass: m, radius: 0.18 });
const spring = world.spring([0, 0], mass, { k, rest: 1 });
show.arrow(() => mass.force("spring"), { from: mass, label: "Spring", colour: "blue" });
show.arrow(() => mass.force("gravity"), { from: mass, label: "Weight" });
show.caption(() => \`It bounces once every \${spring.period().toFixed(2)} s. A stiffer spring or a lighter mass bounces faster.\`);`,
  },
  {
    id: "charges", title: "Electric field between charges", engine: "physics",
    prompt: "Year 12: draw the electric field between two charges",
    code: `show.title("Electric field between charges");
const second = ui.choice("Second charge", ["Negative", "Positive"]);
fields.charge({ x: -2, y: 0, q: 1 });
fields.charge({ x: 2, y: 0, q: second() === "Positive" ? 1 : -1 });
world.setView([-5, 5], [-3.2, 3.2]);
show.caption(() => second() === "Positive"
  ? "Like charges repel: the field lines push away from each other and leave an empty gap in the middle."
  : "Opposite charges attract: field lines run from the positive charge to the negative one.");`,
  },
  {
    id: "waves", title: "Waves: speed, wavelength and frequency", engine: "physics",
    prompt: "Year 10: how are wave speed, wavelength and frequency related?",
    code: `show.title("Waves");
const wavelength = ui.slider("Wavelength", { min: 1, max: 6, value: 3, unit: "m", live: true });
const speed = ui.slider("Wave speed", { min: 1, max: 5, value: 2, unit: "m/s", live: true });
const wave = show.wave({ amplitude: 1, wavelength, speed, y: 0, x: [0, 12] });
world.setView([0, 12], [-2.5, 2.5]);
show.caption(() => \`\${wave.frequency().toFixed(2)} waves pass each second. Shorter waves at the same speed means more waves per second.\`);`,
  },
  {
    id: "fractions", title: "Fractions as decimals", engine: "maths",
    prompt: "Year 6: show how fractions become decimals",
    code: `show.title("Fractions as decimals");
const parts = ui.slider("Equal parts", { min: 2, max: 12, value: 4, step: 1 });
const shaded = ui.slider("Shaded parts", { min: 0, max: 12, value: 3, step: 1, live: true });
const taken = () => Math.min(shaded(), parts());
const amount = () => taken() / parts();
maths.fractionBar({ parts, shaded: taken, label: "The whole, cut into equal parts" });
maths.numberLine({ min: 0, max: 1, step: 0.1, value: amount, label: "On a number line" });
maths.hundredGrid({ value: amount, label: "Out of 100" });
show.caption(() => \`\${taken()}/\${parts()} of the whole is \${Number(amount().toFixed(3))} as a decimal.\`);`,
  },
  {
    id: "parabola", title: "Reading a curve", engine: "maths",
    prompt: "Year 10: how does y change as x changes on y = x²?",
    code: `show.title("Reading a curve");
const x = ui.slider("x", { min: -3, max: 3, value: 1, step: 0.1, live: true });
const curve = maths.plot(v => v * v, { x: [-3, 3], y: [-1, 9], label: "y = x²" });
curve.point(x, { label: "(x, y)" });
show.caption(() => \`When x is \${x().toFixed(1)}, y is \${(x() * x()).toFixed(2)}. Negative and positive x give the same y.\`);`,
  },
];
