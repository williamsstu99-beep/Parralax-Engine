"use client";

import { useState } from "react";
import SceneShell from "./SceneShell";
import { Button, Stepper } from "./controls";

/**
 * Fractions to decimals, one step at a time: a whole, cut into equal parts,
 * some of them taken, the same amount on a number line, then tenths, then a
 * hundred squares, and finally fraction = division = decimal.
 */

const STEPS = ["One whole", "Cut it up", "Take some", "On a number line", "Tenths", "Hundredths", "Fraction = decimal"];
const NAMES = ["", "whole", "halves", "thirds", "quarters", "fifths", "sixths", "sevenths", "eighths", "ninths", "tenths", "elevenths", "twelfths"];
const ONE = ["", "whole", "half", "third", "quarter", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

const WARM = "#f2a65a", WARM_FILL = "rgba(242, 166, 90, 0.82)", LINE = "rgba(220, 228, 240, 0.85)", FAINT = "rgba(220, 228, 240, 0.35)", TEXT = "#e8edf5", MUTED = "#9aa6bd";
const X0 = 110, X1 = 890, BAR_Y = 150, BAR_H = 86, LINE_Y = 370;
const ease = "cubic-bezier(0.2, 0.7, 0.2, 1)";

/** Does this fraction's decimal stop? (Only if the bottom number is made of 2s and 5s.) */
function terminates(n: number, d: number) {
  const g = gcd(n, d); d /= g;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  return d === 1;
}
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function decimal(n: number, d: number) {
  const v = n / d;
  if (terminates(n, d)) return String(Number(v.toFixed(6)));
  return (Math.floor(v * 1000) / 1000).toFixed(3) + "…";
}
function percent(n: number, d: number) {
  const p = (n / d) * 100;
  return terminates(n, d) ? `${Number(p.toFixed(4))}%` : `${(Math.floor(p * 10) / 10).toFixed(1)}…%`;
}

function caption(step: number, n: number, d: number) {
  const dec = decimal(n, d), v = n / d;
  switch (step) {
    case 0: return "Here is one whole. It could be a chocolate bar, a pizza, or a length of rope. Press Next to cut it up.";
    case 1: return d === 1 ? "One part is the whole thing." : `We cut the whole into ${d} equal parts, called ${NAMES[d]}. Each part is one ${ONE[d]}, written 1/${d}.`;
    case 2: return `Take ${n} of them. That's ${n}/${d}: the bottom number says how many equal parts the whole was cut into, and the top says how many we took.`;
    case 3: return `A fraction is also a number. On a line from 0 to 1, ${n}/${d} sits ${n} step${n > 1 ? "s" : ""} of 1/${d} along.`;
    case 4: {
      const t = v * 10;
      if (Math.abs(t - Math.round(t)) < 1e-9) return `Now cut the same line into tenths. ${n}/${d} lands exactly on ${dec}, which is ${Math.round(t)} tenth${Math.round(t) === 1 ? "" : "s"}.`;
      return `Now cut the same line into tenths. ${n}/${d} lands between ${(Math.floor(t) / 10).toFixed(1)} and ${(Math.ceil(t) / 10).toFixed(1)}, so we need smaller pieces to say exactly where.`;
    }
    case 5: {
      const k = v * 100, full = Math.floor(k + 1e-9);
      return Math.abs(k - full) < 1e-9
        ? `Cut the whole into 100 tiny squares, called hundredths. ${n}/${d} fills exactly ${full} of them. ${full} hundredths is written ${dec}.`
        : `Cut the whole into 100 tiny squares, called hundredths. ${n}/${d} fills ${full} of them and a bit of one more, and the bit never finishes. That's why the decimal goes on forever: ${dec}`;
    }
    default: return `So ${n}/${d} = ${n} ÷ ${d} = ${dec}. A fraction is a division waiting to happen, and the decimal is its answer. As a percentage, that's ${percent(n, d)}.`;
  }
}

export default function FractionsScene() {
  const [d, setD] = useState(4);
  const [n, setN] = useState(3);
  const [step, setStep] = useState(0);
  const v = n / d;
  const W = X1 - X0;
  const show = (from: number, to = 99) => step >= from && step <= to;
  const fade = (on: boolean, delay = 0, dy = 10): React.CSSProperties => ({
    opacity: on ? 1 : 0, transform: on ? "none" : `translateY(${dy}px)`,
    transition: `opacity 0.6s ${ease} ${on ? delay : 0}s, transform 0.6s ${ease} ${on ? delay : 0}s`,
  });
  const setParts = (x: number) => { setD(x); setN(m => Math.min(m, x)); };

  const tenths = v * 10, lo = Math.floor(tenths + 1e-9), hi = Math.ceil(tenths - 1e-9);
  const hundred = v * 100, full = Math.floor(hundred + 1e-9), part = hundred - full;
  const gridX = 330, gridY = 96, cell = 34;

  return (
    <SceneShell id="fractions" caption={caption(step, n, d)}
      controls={<>
        <Stepper label="Equal parts" value={d} min={2} max={12} onChange={setParts} />
        <Stepper label="Take" value={n} min={1} max={d} onChange={setN} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Step {step + 1} of {STEPS.length}: {STEPS[step]}</span>
          <div className="flex items-center gap-2">
            <Button onClick={() => setStep(s => Math.max(0, s - 1))}>Back</Button>
            <Button primary onClick={() => setStep(s => (s >= STEPS.length - 1 ? 0 : s + 1))}>{step >= STEPS.length - 1 ? "Start again" : "Next"}</Button>
          </div>
        </div>
      </>}>
      <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" role="img"
        aria-label={`${n} out of ${d} equal parts, shown as a bar, a number line and a decimal`} style={{ fontFamily: "inherit" }}>
        {/* Step dots */}
        <g transform="translate(500 36)">
          {STEPS.map((_, i) => <circle key={i} cx={(i - (STEPS.length - 1) / 2) * 18} r={i === step ? 4 : 3} fill={i <= step ? WARM : "rgba(255,255,255,0.15)"} style={{ transition: "fill 0.4s" }} />)}
        </g>

        {/* The whole: a bar, then cut, then partly taken. It sits centred until the number line arrives. */}
        <g style={{ transform: `translateY(${step < 3 ? 90 : 0}px)`, transition: `transform 0.7s ${ease}` }}>
        <g style={fade(step <= 4, 0, -16)}>
          <rect x={X0} y={BAR_Y} width={W} height={BAR_H} rx={10} fill="rgba(255,255,255,0.035)" stroke={LINE} strokeWidth={1.4} />
          {Array.from({ length: d }, (_, i) => (
            <rect key={`f${d}-${i}`} x={X0 + (W / d) * i + 3} y={BAR_Y + 3} width={W / d - 6} height={BAR_H - 6} rx={7} fill={WARM_FILL}
              style={{ opacity: step >= 2 && i < n ? 1 : 0, transition: `opacity 0.45s ${ease} ${step >= 2 && i < n ? 0.15 + i * 0.12 : 0}s` }} />
          ))}
          {Array.from({ length: d - 1 }, (_, i) => {
            const x = X0 + (W / d) * (i + 1);
            return <line key={`c${d}-${i}`} x1={x} x2={x} y1={BAR_Y} y2={BAR_Y + BAR_H} stroke={LINE} strokeWidth={1.4}
              style={{ opacity: step >= 1 ? 1 : 0, strokeDasharray: BAR_H, strokeDashoffset: step >= 1 ? 0 : BAR_H, transition: `stroke-dashoffset 0.5s ${ease} ${step >= 1 ? i * 0.08 : 0}s, opacity 0.2s ${step >= 1 ? i * 0.08 : 0}s` }} />;
          })}
          <text x={500} y={BAR_Y - 18} textAnchor="middle" fontSize={15} fill={MUTED} style={fade(step === 0)}>1 whole</text>
          {d <= 12 && Array.from({ length: d }, (_, i) => (
            <text key={`l${d}-${i}`} x={X0 + (W / d) * (i + 0.5)} y={BAR_Y + BAR_H / 2 + 6} textAnchor="middle" fontSize={d > 8 ? 14 : 17} fontWeight={600}
              fill={step >= 2 && i < n ? "#1a1208" : TEXT} style={fade(step >= 1, 0.3 + i * 0.05, 0)}>1/{d}</text>
          ))}
        </g>
        </g>

        {/* The same amount on a number line. */}
        <g style={fade(show(3, 4), 0.1)}>
          <line x1={X0 + (W * v)} x2={X0 + (W * v)} y1={BAR_Y + BAR_H + 6} y2={LINE_Y - 12} stroke={WARM} strokeWidth={1.2} strokeDasharray="3 5" />
          <line x1={X0} x2={X1} y1={LINE_Y} y2={LINE_Y} stroke={LINE} strokeWidth={1.5} />
          <line x1={X0} x2={X0 + W * v} y1={LINE_Y} y2={LINE_Y} stroke={WARM} strokeWidth={4} strokeLinecap="round" />
          {Array.from({ length: d + 1 }, (_, i) => {
            const x = X0 + (W / d) * i;
            return <g key={`t${d}-${i}`}>
              <line x1={x} x2={x} y1={LINE_Y - 12} y2={LINE_Y + 12} stroke={LINE} strokeWidth={1.4} />
              <text x={x} y={LINE_Y - 22} textAnchor="middle" fontSize={14} fill={i === n ? WARM : MUTED} fontWeight={i === n ? 700 : 500}>{i === 0 ? "0" : i === d ? "1" : `${i}/${d}`}</text>
            </g>;
          })}
          <circle cx={X0 + W * v} cy={LINE_Y} r={7} fill={WARM} stroke="#0b0f17" strokeWidth={2} />
        </g>

        {/* Tenths underneath the line. */}
        <g style={fade(step === 4, 0.15)}>
          {Array.from({ length: 11 }, (_, i) => {
            const x = X0 + (W / 10) * i, near = i === lo || i === hi;
            return <g key={`ten${i}`} style={{ opacity: step === 4 ? 1 : 0, transition: `opacity 0.4s ${step === 4 ? 0.2 + i * 0.05 : 0}s` }}>
              <line x1={x} x2={x} y1={LINE_Y + 2} y2={LINE_Y + 20} stroke={near ? WARM : FAINT} strokeWidth={1.2} />
              {i > 0 && i < 10 && <text x={x} y={LINE_Y + 40} textAnchor="middle" fontSize={13} fill={near ? WARM : MUTED} fontWeight={near ? 700 : 500}>0.{i}</text>}
            </g>;
          })}
          {lo !== hi && <path d={`M${X0 + (W / 10) * lo} ${LINE_Y + 56} v8 H${X0 + (W / 10) * hi} v-8`} fill="none" stroke={WARM} strokeWidth={1.4} />}
          <text x={X0 + W * v} y={LINE_Y + 92} textAnchor="middle" fontSize={15} fill={TEXT}>
            {lo === hi ? `exactly ${(lo / 10).toFixed(1)}` : `between ${(lo / 10).toFixed(1)} and ${(hi / 10).toFixed(1)}`}
          </text>
        </g>

        {/* A hundred squares. */}
        <g style={fade(step === 5, 0.2, 16)}>
          {Array.from({ length: 100 }, (_, i) => {
            const r = Math.floor(i / 10), c = i % 10, x = gridX + c * cell, y = gridY + r * cell;
            const on = i < full, partial = i === full && part > 1e-9;
            return <g key={`g${i}`}>
              <rect x={x + 1.5} y={y + 1.5} width={cell - 3} height={cell - 3} rx={3} fill="rgba(255,255,255,0.04)" stroke="rgba(220,228,240,0.18)" strokeWidth={1} />
              {(on || partial) && <rect x={x + 1.5} y={y + 1.5} width={(cell - 3) * (partial ? part : 1)} height={cell - 3} rx={3} fill={WARM_FILL}
                style={{ opacity: step === 5 ? 1 : 0, transition: `opacity 0.25s ${step === 5 ? 0.4 + i * 0.012 : 0}s` }} />}
            </g>;
          })}
          <text x={gridX + 10 * cell + 34} y={gridY + 140} fontSize={40} fontWeight={700} fill={TEXT}>{decimal(n, d)}</text>
          <text x={gridX + 10 * cell + 34} y={gridY + 172} fontSize={15} fill={MUTED}>{part > 1e-9 ? `${full} and a bit out of 100` : `${full} out of 100`}</text>
          <text x={gridX - 34} y={gridY + 140} textAnchor="end" fontSize={40} fontWeight={700} fill={WARM}>{n}/{d}</text>
          <text x={gridX - 34} y={gridY + 172} textAnchor="end" fontSize={15} fill={MUTED}>of the whole</text>
        </g>

        {/* Fraction = division = decimal = percentage. */}
        <g style={fade(step === 6, 0.1, 14)}>
          {[
            { x: 210, big: `${n}/${d}`, small: "fraction", color: WARM },
            { x: 410, big: `${n} ÷ ${d}`, small: "division", color: TEXT },
            { x: 610, big: decimal(n, d), small: "decimal", color: TEXT },
            { x: 810, big: percent(n, d), small: "percentage", color: TEXT },
          ].map((t, i) => (
            <g key={t.small} style={fade(step === 6, 0.15 + i * 0.18, 12)}>
              <text x={t.x} y={260} textAnchor="middle" fontSize={50} fontWeight={700} fill={t.color}>{t.big}</text>
              <text x={t.x} y={300} textAnchor="middle" fontSize={13} fill={MUTED} style={{ letterSpacing: "0.14em" }}>{t.small.toUpperCase()}</text>
              {i < 3 && <text x={t.x + 100} y={256} textAnchor="middle" fontSize={34} fill={MUTED}>=</text>}
            </g>
          ))}
          <g transform="translate(310 360)">
            <rect width={380} height={44} rx={8} fill="rgba(255,255,255,0.035)" stroke={LINE} strokeWidth={1.2} />
            {Array.from({ length: d }, (_, i) => <rect key={`s${d}-${i}`} x={(380 / d) * i + 2.5} y={2.5} width={380 / d - 5} height={39} rx={5} fill={i < n ? WARM_FILL : "transparent"} />)}
            {Array.from({ length: d - 1 }, (_, i) => <line key={`sc${d}-${i}`} x1={(380 / d) * (i + 1)} x2={(380 / d) * (i + 1)} y1={0} y2={44} stroke={LINE} strokeWidth={1.2} />)}
          </g>
        </g>
      </svg>
    </SceneShell>
  );
}
