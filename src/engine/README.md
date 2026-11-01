# The Parallax Engine

The engine that turns a learning request into an accurate, interactive simulation.

- **Truth** (`truth/`): deterministic solvers. Every number a student sees comes from here, never from an AI model.
  - `truth/circuit`: modified nodal analysis with Newton–Raphson (diodes, LEDs) and backward-Euler transient steps (capacitors, inductors), plus student-facing diagnostics.
- **Lens** (coming next): how a concept is drawn and played with. AI-generated on request, reading Truth's output.
- **Spec** (coming next): the structured lesson format the AI writes and the engine validates before anything renders.
