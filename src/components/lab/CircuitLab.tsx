"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  CATALOG, boardIdOf, buildNetlist, ends, hasDynamics, key, newId, route, samePt, terminals,
  type Board, type Part, type PartKind, type Pt, type Rot,
} from "@/engine/lens/circuit/board";
import { SAMPLES, type Sample } from "@/engine/lens/circuit/samples";
import { initialTransientState, solveDC, step } from "@/engine/truth/circuit/solver";
import type { Solution, TransientState } from "@/engine/truth/circuit/types";
import { Mark, Wordmark } from "@/components/brand/Mark";
import { G, LED_COLORS, PartSymbol, TrayIcon } from "./symbols";
import { fmtAmps, fmtFarads, fmtOhms, fmtVolts, fmtWatts } from "./format";

const W = 22, H = 14; // board size in grid units
const TRAY: PartKind[] = ["battery", "resistor", "bulb", "led", "switch", "capacitor", "diode"];
const RESISTORS = [10, 22, 47, 100, 220, 330, 470, 1000, 2200, 4700, 10000, 47000, 100000];
const BULBS = [6, 12, 24, 48, 96];
const CAPS = [100, 470, 1000, 2200, 4700, 10000];

/* ---------------- state ---------------- */

type Sel = { type: "part" | "wire"; id: string } | null;
interface LabState { board: Board; past: Board[]; selected: Sel; sampleId: string }
type Action =
  | { type: "load"; sampleId: string }
  | { type: "commit"; board: Board; select?: Sel }
  | { type: "select"; sel: Sel }
  | { type: "undo" }
  | { type: "reset"; board: Board };

const loadSample = (id: string) => structuredClone(SAMPLES.find(s => s.id === id)!.board);

function reducer(s: LabState, a: Action): LabState {
  switch (a.type) {
    case "load": return { board: loadSample(a.sampleId), past: [], selected: null, sampleId: a.sampleId };
    case "commit": return { ...s, board: a.board, past: [...s.past.slice(-49), s.board], selected: a.select === undefined ? s.selected : a.select };
    case "select": return { ...s, selected: a.sel };
    case "reset": return { ...s, board: structuredClone(a.board), past: [...s.past.slice(-49), s.board], selected: null };
    case "undo": return s.past.length ? { ...s, board: s.past[s.past.length - 1], past: s.past.slice(0, -1), selected: null } : s;
  }
}

type Drag =
  | { kind: "new"; part: PartKind; over: Pt | null; cx: number; cy: number; startX: number; startY: number }
  | { kind: "move"; id: string; grab: Pt; origin: Pt; moved: boolean }
  | { kind: "wire"; from: Pt; to: Pt };

const mix = (t: number) => {
  const a = [0x3a, 0x48, 0x68], b = [0xff, 0xb5, 0x47], k = Math.max(0, Math.min(1, t));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",")})`;
};

/* ---------------- component ---------------- */

export default function CircuitLab({ initial, embedded = false }: { initial?: Sample; embedded?: boolean } = {}) {
  const [state, dispatch] = useReducer(reducer, null, () => ({ board: structuredClone(initial?.board ?? loadSample("bulb")), past: [], selected: null, sampleId: initial?.id ?? "bulb" }));
  const [preview, setPreview] = useState<Board | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [mode, setMode] = useState<"select" | "wire">("select");
  const [armed, setArmed] = useState<PartKind | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const board = preview ?? state.board;
  const sample = initial ?? SAMPLES.find(s => s.id === state.sampleId)!;

  /* ---- Truth ---- */
  const net = useMemo(() => buildNetlist(board), [board]);
  const dynamic = hasDynamics(board);
  const dc = useMemo(() => (dynamic ? null : { sol: solveDC(net.circuit) }), [net, dynamic]);
  const [liveSol, setLiveSol] = useState<Solution | null>(null);
  const tState = useRef<TransientState | null>(null);
  useEffect(() => {
    if (!dynamic) return;
    const prev = tState.current;
    const fresh = initialTransientState(net.circuit);
    if (prev) for (const id of Object.keys(fresh.capVolts)) if (id in prev.capVolts) fresh.capVolts[id] = prev.capVolts[id];
    tState.current = fresh;
    let raf = 0, last = performance.now(), lastPush = 0;
    const tick = (now: number) => {
      const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
      if (tState.current) tState.current = step(net.circuit, tState.current, Math.max(dt, 1 / 240));
      if (now - lastPush > 80 && tState.current?.solution) { lastPush = now; setLiveSol(tState.current.solution); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [net, dynamic]);
  const sol: Solution | null = dynamic ? liveSol : dc?.sol ?? null;
  const solRef = useRef<Solution | null>(null);
  useEffect(() => { solRef.current = dynamic ? tState.current?.solution ?? sol : sol; });

  const vmax = Math.max(1, ...board.parts.filter(p => p.kind === "battery").map(p => p.volts ?? 9));
  const flagged = useMemo(() => {
    const f = new Set<string>();
    for (const d of sol?.diagnostics ?? []) if (d.severity !== "info") for (const t of d.targets) f.add(boardIdOf(t));
    return f;
  }, [sol]);

  /* ---- flow animation (canvas overlay, imperative) ---- */
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathsRef = useRef<{ id: string; a: Pt; b: Pt }[]>([]);
  useEffect(() => {
    pathsRef.current = [
      ...board.parts.map(p => { const [a, b] = terminals(p); return { id: p.id, a, b }; }),
      ...net.segs.map(s => ({ id: s.id, a: s.a, b: s.b })),
    ];
  }, [board, net]);
  useEffect(() => {
    const cv = canvasRef.current!, wrap = wrapRef.current!, ctx = cv.getContext("2d")!;
    const phase = new Map<string, number>();
    const fit = () => { const r = wrap.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = r.height * dpr; };
    const ro = new ResizeObserver(fit); ro.observe(wrap); fit();
    let raf = 0, last = performance.now();
    const SP = 0.5;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = cv.width / W;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const so = solRef.current;
      if (so) for (const p of pathsRef.current) {
        const I = so.components[p.id]?.amps ?? 0, mag = Math.abs(I);
        if (mag < 2e-5) continue;
        const v = Math.sign(I) * Math.min(5, 1.6 * Math.log10(1 + mag * 1000));
        const len = Math.abs(p.b.x - p.a.x) + Math.abs(p.b.y - p.a.y);
        let ph = ((phase.get(p.id) ?? 0) + v * dt) % SP; if (ph < 0) ph += SP; phase.set(p.id, ph);
        const ux = (p.b.x - p.a.x) / len, uy = (p.b.y - p.a.y) / len;
        const alpha = Math.min(1, 0.35 + mag * 40);
        for (let d = ph; d < len; d += SP) {
          const x = (p.a.x + ux * d) * s, y = (p.a.y + uy * d) * s;
          ctx.fillStyle = `rgba(127,216,255,${0.18 * alpha})`; ctx.beginPath(); ctx.arc(x, y, s * 0.17, 0, 7); ctx.fill();
          ctx.fillStyle = `rgba(255,244,214,${alpha})`; ctx.beginPath(); ctx.arc(x, y, s * 0.075, 0, 7); ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  /* ---- editing helpers ---- */
  const svgRef = useRef<SVGSVGElement>(null);
  const toGrid = useCallback((cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H, inside: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom };
  }, []);
  const snap = (p: { x: number; y: number }): Pt => ({ x: Math.max(1, Math.min(W - 1, Math.round(p.x))), y: Math.max(1, Math.min(H - 1, Math.round(p.y))) });
  const commit = useCallback((b: Board, select?: Sel) => dispatch({ type: "commit", board: b, select }), []);
  const updatePart = (id: string, patch: Partial<Part>) => commit({ ...state.board, parts: state.board.parts.map(p => (p.id === id ? { ...p, ...patch } : p)) });
  const addPart = (kind: PartKind, at: Pt) => {
    const part: Part = { id: newId("p"), kind, x: at.x, y: at.y, rot: 0, ...CATALOG[kind].defaults };
    commit({ ...state.board, parts: [...state.board.parts, part] }, { type: "part", id: part.id });
  };
  const removeSelected = useCallback(() => {
    const sel = state.selected; if (!sel) return;
    const b = state.board;
    commit(sel.type === "part" ? { ...b, parts: b.parts.filter(p => p.id !== sel.id) } : { ...b, wires: b.wires.filter(w => w.id !== sel.id) }, null);
  }, [state.selected, state.board, commit]);
  const rotateSelected = useCallback(() => {
    const sel = state.selected; if (sel?.type !== "part") return;
    commit({ ...state.board, parts: state.board.parts.map(p => (p.id === sel.id ? { ...p, rot: ((p.rot + 1) % 4) as Rot } : p)) });
  }, [state.selected, state.board, commit]);

  /* ---- pointer drags ---- */
  const dragRef = useRef<Drag | null>(null);
  const previewRef = useRef<Board | null>(null);
  useEffect(() => { dragRef.current = drag; }, [drag]);
  useEffect(() => { previewRef.current = preview; }, [preview]);
  const boardRef = useRef(state.board);
  useEffect(() => { boardRef.current = state.board; }, [state.board]);

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const g = toGrid(e.clientX, e.clientY);
      if (d.kind === "new") setDrag({ ...d, over: g.inside ? snap(g) : null, cx: e.clientX, cy: e.clientY });
      else if (d.kind === "wire") setDrag({ ...d, to: snap(g) });
      else {
        const p = snap(g), dx = p.x - d.grab.x, dy = p.y - d.grab.y;
        const b = boardRef.current;
        setPreview({ ...b, parts: b.parts.map(q => (q.id === d.id ? { ...q, x: d.origin.x + dx, y: d.origin.y + dy } : q)) });
        if ((dx || dy) && !d.moved) setDrag({ ...d, moved: true });
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current; if (!d) return;
      const b = boardRef.current;
      if (d.kind === "new") {
        const g = toGrid(e.clientX, e.clientY);
        if (g.inside) { addPart(d.part, snap(g)); setArmed(null); }
        else if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) setArmed(a => (a === d.part ? null : d.part)); // tap = arm for tap-to-place
      } else if (d.kind === "wire") {
        if (!samePt(d.from, d.to)) commit({ ...b, wires: [...b.wires, { id: newId("w"), points: route(d.from, d.to) }] }, null);
      } else {
        if (d.moved && previewRef.current) commit(previewRef.current);
        else {
          const part = b.parts.find(p => p.id === d.id);
          if (part?.kind === "switch") commit({ ...b, parts: b.parts.map(p => (p.id === d.id ? { ...p, closed: !p.closed } : p)) }, { type: "part", id: d.id });
          else dispatch({ type: "select", sel: { type: "part", id: d.id } });
        }
      }
      setDrag(null); setPreview(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    // addPart/commit are stable enough for the life of one drag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, toGrid]);

  const onBoardDown = (e: React.PointerEvent) => {
    const g = snap(toGrid(e.clientX, e.clientY));
    if (armed) { addPart(armed, g); setArmed(null); return; }
    if (mode === "wire") { setDrag({ kind: "wire", from: g, to: g }); return; }
    dispatch({ type: "select", sel: null });
  };

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && state.selected) { e.preventDefault(); removeSelected(); }
      else if (e.key === "r" || e.key === "R") rotateSelected();
      else if (e.key === "w" || e.key === "W") setMode(m => (m === "wire" ? "select" : "wire"));
      else if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); dispatch({ type: "undo" }); }
      else if (e.key === "Escape") { setMode("select"); setArmed(null); dispatch({ type: "select", sel: null }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selected, removeSelected, rotateSelected]);

  /* ---- derived display values ---- */
  const selPart = state.selected?.type === "part" ? board.parts.find(p => p.id === state.selected!.id) : undefined;
  const selWire = state.selected?.type === "wire" ? board.wires.find(w => w.id === state.selected!.id) : undefined;
  const challenge = sample.challenge && sol ? sample.challenge.check(state.board, sol) : null;
  const batteryAmps = board.parts.filter(p => p.kind === "battery").reduce((s, p) => s + Math.abs(sol?.components[p.id]?.amps ?? 0), 0);
  const nodeCount = new Set(net.circuit.components.flatMap(c => [c.a, c.b])).size;
  const wireAmps = (wid: string) => Math.max(0, ...net.segs.filter(s => s.wireId === wid).map(s => Math.abs(sol?.components[s.id]?.amps ?? 0)));
  const hoverPart = hover ? board.parts.find(p => p.id === hover) : undefined;

  return (
    <div className={`flex flex-col text-[var(--fg)] ${embedded ? "" : "min-h-screen bg-[var(--ink)]"}`}>
      {/* top bar */}
      {embedded ? (
        <div className="flex flex-wrap items-center justify-end gap-2 pb-3">
          <button onClick={() => setMode(m => (m === "wire" ? "select" : "wire"))} aria-pressed={mode === "wire"}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${mode === "wire" ? "border-[var(--flow)] bg-[#16294A] text-[var(--flow)]" : "border-[var(--line)] bg-[var(--raise)]"}`}>
            Draw wires <kbd className="ml-1 font-mono text-xs text-[var(--muted)]">W</kbd>
          </button>
          <button onClick={() => dispatch({ type: "undo" })} disabled={!state.past.length} className="rounded-lg border border-[var(--line)] bg-[var(--raise)] px-3 py-2 text-sm disabled:opacity-40">Undo</button>
          <button onClick={() => initial && dispatch({ type: "reset", board: initial.board })} className="rounded-lg border border-[var(--line)] bg-[var(--raise)] px-3 py-2 text-sm">Reset</button>
        </div>
      ) : (
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--line)] px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-[19px]"><Mark size={28} /><Wordmark /></Link>
        <span className="hidden text-[var(--muted)] sm:inline">/</span>
        <span className="font-medium">Circuits lab</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label htmlFor="sample" className="sr-only">Load a circuit</label>
          <select id="sample" value={state.sampleId} onChange={e => dispatch({ type: "load", sampleId: e.target.value })}
            className="rounded-lg border border-[var(--line)] bg-[var(--raise)] px-3 py-2 text-sm">
            {SAMPLES.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <button onClick={() => setMode(m => (m === "wire" ? "select" : "wire"))} aria-pressed={mode === "wire"}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${mode === "wire" ? "border-[var(--flow)] bg-[#16294A] text-[var(--flow)]" : "border-[var(--line)] bg-[var(--raise)]"}`}>
            Draw wires <kbd className="ml-1 font-mono text-xs text-[var(--muted)]">W</kbd>
          </button>
          <button onClick={() => dispatch({ type: "undo" })} disabled={!state.past.length}
            className="rounded-lg border border-[var(--line)] bg-[var(--raise)] px-3 py-2 text-sm disabled:opacity-40">Undo</button>
          <button onClick={() => commit({ parts: [], wires: [] }, null)} className="rounded-lg border border-[var(--line)] bg-[var(--raise)] px-3 py-2 text-sm">Clear</button>
        </div>
      </header>
      )}

      <div className={`grid flex-1 gap-4 lg:grid-cols-[132px_minmax(0,1fr)_320px] ${embedded ? "" : "p-4 sm:p-6"}`}>
        {/* tray */}
        <aside aria-label="Components" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          <p className="hidden font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] lg:block">Components</p>
          {TRAY.map(kind => {
            const demo: Part = { id: "demo", kind, x: 0, y: 0, rot: 0, ...CATALOG[kind].defaults, closed: kind === "switch" ? false : undefined };
            return (
              <button key={kind} title={CATALOG[kind].blurb}
                onPointerDown={e => { e.preventDefault(); setDrag({ kind: "new", part: kind, over: null, cx: e.clientX, cy: e.clientY, startX: e.clientX, startY: e.clientY }); }}
                className={`flex min-w-[96px] shrink-0 touch-none select-none flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[13px] transition-colors ${armed === kind ? "border-[var(--volt)] bg-[#2A2414]" : "border-[var(--line)] bg-[var(--panel)] hover:bg-[var(--raise)]"}`}>
                <TrayIcon part={demo} />
                {CATALOG[kind].label}
              </button>
            );
          })}
          <p className="hidden text-xs leading-relaxed text-[var(--muted)] lg:block">Drag onto the board. Drag from a part&apos;s end to draw a wire.</p>
        </aside>

        {/* board */}
        <section className="flex min-w-0 flex-col gap-3">
          {sample.challenge && (
            <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-3 ${challenge?.done ? "border-[var(--good)] bg-[#12291F]" : "border-[var(--line)] bg-[var(--panel)]"}`}>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--volt)]">Challenge</span>
              <span className="font-medium">{sample.challenge.title}</span>
              <span className="text-sm text-[var(--muted)]">{sample.challenge.goal}</span>
              <span className={`ml-auto text-sm font-medium ${challenge?.done ? "text-[var(--good)]" : "text-[var(--fg)]"}`}>{challenge?.done ? "✓ " : ""}{challenge?.hint}</span>
            </div>
          )}
          <div ref={wrapRef} className="relative w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[radial-gradient(120%_90%_at_50%_0%,#152039_0%,var(--ink)_70%)]" style={{ aspectRatio: `${W} / ${H}` }}>
            <svg ref={svgRef} viewBox={`0 0 ${W * G} ${H * G}`} className={`absolute inset-0 h-full w-full touch-none select-none ${mode === "wire" || armed ? "cursor-crosshair" : ""}`}
              onPointerDown={onBoardDown} role="application" aria-label="Circuit board">
              <defs>
                <pattern id="dots" width={G} height={G} patternUnits="userSpaceOnUse"><circle cx={0} cy={0} r={1.6} fill="rgba(160,180,220,0.18)" /></pattern>
                <radialGradient id="glow"><stop offset="0" stopColor="#FFD678" stopOpacity="0.9" /><stop offset="1" stopColor="#FFB547" stopOpacity="0" /></radialGradient>
                {Object.entries(LED_COLORS).map(([c, hex]) => (
                  <radialGradient key={c} id={`glow-${c}`}><stop offset="0" stopColor={hex} stopOpacity="0.85" /><stop offset="1" stopColor={hex} stopOpacity="0" /></radialGradient>
                ))}
              </defs>
              <rect width={W * G} height={H * G} fill="url(#dots)" />

              {/* glows */}
              {board.parts.map(p => {
                const b = sol?.components[p.id]?.brightness ?? 0;
                if ((p.kind !== "bulb" && p.kind !== "led") || b < 0.01) return null;
                const r = (p.kind === "bulb" ? 1.2 + 3 * b : 0.8 + 1.6 * Math.min(1, b)) * G;
                return <circle key={`g-${p.id}`} cx={p.x * G} cy={p.y * G} r={r} fill={p.kind === "bulb" ? "url(#glow)" : `url(#glow-${p.color ?? "red"})`} opacity={p.kind === "bulb" ? Math.min(1, 0.4 + b) : 0.9} pointerEvents="none" />;
              })}

              {/* wires */}
              {board.wires.map(w => {
                const v = sol?.nodeVolts[key(w.points[0])] ?? 0;
                const sel = state.selected?.type === "wire" && state.selected.id === w.id;
                const d = w.points.map((p, i) => `${i ? "L" : "M"}${p.x * G} ${p.y * G}`).join(" ");
                return (
                  <g key={w.id}>
                    {sel && <path d={d} fill="none" stroke="rgba(127,216,255,0.35)" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />}
                    <path d={d} fill="none" stroke={flagged.has(w.id) ? "#FF7A6B" : mix(v / vmax)} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                    <path d={d} fill="none" stroke="transparent" strokeWidth={16}
                      onPointerDown={e => { e.stopPropagation(); if (mode === "wire") setDrag({ kind: "wire", from: snap(toGrid(e.clientX, e.clientY)), to: snap(toGrid(e.clientX, e.clientY)) }); else dispatch({ type: "select", sel: { type: "wire", id: w.id } }); }} />
                  </g>
                );
              })}
              {/* junction dots */}
              {(() => {
                const count = new Map<string, number>();
                for (const s of net.segs) for (const p of [s.a, s.b]) count.set(key(p), (count.get(key(p)) ?? 0) + 1);
                return [...count].filter(([, n]) => n >= 3).map(([k]) => { const [x, y] = k.split(",").map(Number); return <circle key={`j-${k}`} cx={x * G} cy={y * G} r={5} fill="#9AA8C7" pointerEvents="none" />; });
              })()}

              {/* parts */}
              {board.parts.map(p => {
                const sel = state.selected?.type === "part" && state.selected.id === p.id;
                const bad = flagged.has(p.id);
                const horiz = p.rot % 2 === 0;
                const label = p.kind === "battery" ? `${p.volts} V` : p.kind === "resistor" || p.kind === "bulb" ? fmtOhms(p.ohms ?? 0) : p.kind === "capacitor" ? fmtFarads(p.microfarads ?? 0) : "";
                return (
                  <g key={p.id} transform={`translate(${p.x * G} ${p.y * G})`}
                    onPointerDown={e => { e.stopPropagation(); if (armed || mode === "wire") return onBoardDown(e); setDrag({ kind: "move", id: p.id, grab: snap(toGrid(e.clientX, e.clientY)), origin: { x: p.x, y: p.y }, moved: false }); }}
                    onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(h => (h === p.id ? null : h))}
                    className={p.kind === "switch" ? "cursor-pointer" : "cursor-grab"}>
                    <g transform={`rotate(${p.rot * 90})`}>
                      {(sel || bad) && <rect x={-G + 4} y={-22} width={2 * G - 8} height={44} rx={12} fill={bad ? "rgba(255,122,107,0.12)" : "rgba(127,216,255,0.10)"} stroke={bad ? "#FF7A6B" : "#7FD8FF"} strokeWidth={1.5} strokeDasharray={bad ? "5 4" : undefined} />}
                      <rect x={-G + 6} y={-20} width={2 * G - 12} height={40} fill="transparent" />
                      <PartSymbol part={p} result={sol?.components[p.id]} />
                    </g>
                    {label && <text x={horiz ? 0 : 26} y={horiz ? -26 : 4} textAnchor={horiz ? "middle" : "start"} fontSize={12.5} fill="#AEB9D2" className="font-mono" pointerEvents="none">{label}</text>}
                  </g>
                );
              })}

              {/* terminals: drag from here to wire */}
              {board.parts.flatMap(p => ends(p).map((t, i) => (
                <circle key={`${p.id}-t${i}`} cx={t.x * G} cy={t.y * G} r={7} fill="rgba(127,216,255,0.001)" stroke="transparent" className="cursor-crosshair hover:fill-[rgba(127,216,255,0.35)]"
                  onPointerDown={e => { e.stopPropagation(); setDrag({ kind: "wire", from: t, to: t }); }} />
              )))}

              {/* drag previews */}
              {drag?.kind === "wire" && !samePt(drag.from, drag.to) && (
                <path d={route(drag.from, drag.to).map((p, i) => `${i ? "L" : "M"}${p.x * G} ${p.y * G}`).join(" ")} fill="none" stroke="#7FD8FF" strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" pointerEvents="none" />
              )}
              {drag?.kind === "new" && drag.over && (
                <g transform={`translate(${drag.over.x * G} ${drag.over.y * G})`} opacity={0.65} pointerEvents="none">
                  <PartSymbol part={{ id: "ghost", kind: drag.part, x: 0, y: 0, rot: 0, ...CATALOG[drag.part].defaults }} />
                </g>
              )}
            </svg>
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

            {/* hover readout */}
            {hoverPart && sol && !drag && (
              <div className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[rgba(19,27,46,0.95)] px-3 py-2 font-mono text-xs leading-5 shadow-lg"
                style={{ left: `${(hoverPart.x / W) * 100}%`, top: `calc(${(hoverPart.y / H) * 100}% + 34px)` }}>
                <div className="font-sans text-[13px] font-medium">{CATALOG[hoverPart.kind].label}</div>
                <div className="text-[var(--flow)]">{fmtAmps(sol.components[hoverPart.id]?.amps ?? 0)}</div>
                <div className="text-[var(--volt)]">{fmtVolts(sol.components[hoverPart.id]?.volts ?? 0)}</div>
              </div>
            )}
            {board.parts.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[var(--muted)]">
                <p>Drag a battery onto the board to start.<br /><span className="text-sm">On a tablet, tap a part, then tap where it goes.</span></p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-[var(--muted)]">
            <span>Battery supplies <b className="font-mono font-medium text-[var(--flow)]">{fmtAmps(batteryAmps)}</b></span>
            <span className="hidden sm:inline">{sample.summary}</span>
            <span className="ml-auto font-mono text-xs">Truth · nodal analysis · {nodeCount} nodes{dynamic ? " · stepping live" : ""}</span>
          </div>
        </section>

        {/* inspector */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            {selPart ? (
              <Inspector part={selPart} sol={sol} onChange={patch => updatePart(selPart.id, patch)} onRotate={rotateSelected} onDelete={removeSelected} />
            ) : selWire ? (
              <div className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Wire</h2>
                <Readout label="Current" value={fmtAmps(wireAmps(selWire.id))} color="var(--flow)" />
                <Readout label="Voltage here" value={fmtVolts(sol?.nodeVolts[key(selWire.points[0])] ?? 0)} color="var(--volt)" />
                <button onClick={removeSelected} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">Delete wire</button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
                <h2 className="text-lg font-semibold text-[var(--fg)]">{sample.title}</h2>
                <p>{sample.summary}</p>
                <p>Click a part to see its numbers and change it. <kbd className="font-mono">R</kbd> rotates, <kbd className="font-mono">Delete</kbd> removes.</p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">What&apos;s happening</h2>
            {sol && sol.diagnostics.length ? (
              <ul className="flex flex-col gap-2">
                {sol.diagnostics.map((d, i) => (
                  <li key={i}>
                    <button onClick={() => { const t = d.targets[0]; if (t) dispatch({ type: "select", sel: board.parts.some(p => p.id === boardIdOf(t)) ? { type: "part", id: boardIdOf(t) } : { type: "wire", id: boardIdOf(t) } }); }}
                      className="flex w-full gap-2.5 text-left text-sm leading-snug">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${d.severity === "error" ? "bg-[var(--bad)]" : d.severity === "warning" ? "bg-[var(--volt)]" : "bg-[var(--flow)]"}`} />
                      <span>{d.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--muted)]">{batteryAmps > 1e-6 ? "Current is flowing round the loop. Hover a part to see its numbers." : "Nothing to report."}</p>
            )}
          </div>
        </aside>
      </div>

      {drag?.kind === "new" && !drag.over && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--volt)] bg-[var(--raise)] px-3 py-1.5 text-sm" style={{ left: drag.cx, top: drag.cy }}>
          {CATALOG[drag.part].label}
        </div>
      )}
    </div>
  );
}

/* ---------------- inspector ---------------- */

function Readout({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-[var(--muted)]">{label}</span>
      <span className="font-mono text-base font-medium tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

function Stepper({ id, label, values, value, fmt, onChange }: { id: string; label: string; values: number[]; value: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  const idx = Math.max(0, values.findIndex(v => v >= value));
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-mono text-[var(--volt)]">{fmt(values[idx])}</span></label>
      <input id={id} type="range" min={0} max={values.length - 1} step={1} value={idx} onChange={e => onChange(values[+e.target.value])} className="w-full accent-[var(--volt)]" />
    </div>
  );
}

function Inspector({ part, sol, onChange, onRotate, onDelete }: { part: Part; sol: Solution | null; onChange: (p: Partial<Part>) => void; onRotate: () => void; onDelete: () => void }) {
  const r = sol?.components[part.id];
  const info = CATALOG[part.kind];
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{info.label}</h2>
        <p className="text-sm text-[var(--muted)]">{info.blurb}</p>
      </div>
      <div className="flex flex-col gap-1.5 rounded-xl bg-[var(--ink)] px-3 py-2.5">
        <Readout label={part.kind === "battery" ? "Supplying" : "Current"} value={fmtAmps(r?.amps ?? 0)} color="var(--flow)" />
        <Readout label={part.kind === "battery" ? "Terminal voltage" : "Voltage across"} value={fmtVolts(r?.volts ?? 0)} color="var(--volt)" />
        <Readout label={part.kind === "battery" ? "Power delivered" : "Power"} value={fmtWatts(r?.watts ?? 0)} color="var(--fg)" />
      </div>
      {part.kind === "battery" && (
        <div>
          <label htmlFor="volts" className="mb-1 flex justify-between text-sm"><span>Voltage</span><span className="font-mono text-[var(--volt)]">{part.volts} V</span></label>
          <input id="volts" type="range" min={1.5} max={12} step={0.5} value={part.volts ?? 9} onChange={e => onChange({ volts: +e.target.value })} className="w-full accent-[var(--volt)]" />
        </div>
      )}
      {part.kind === "resistor" && <Stepper id="ohms" label="Resistance" values={RESISTORS} value={part.ohms ?? 330} fmt={fmtOhms} onChange={v => onChange({ ohms: v })} />}
      {part.kind === "bulb" && <Stepper id="bulb" label="Bulb resistance" values={BULBS} value={part.ohms ?? 24} fmt={fmtOhms} onChange={v => onChange({ ohms: v })} />}
      {part.kind === "capacitor" && <Stepper id="cap" label="Capacitance" values={CAPS} value={part.microfarads ?? 1000} fmt={fmtFarads} onChange={v => onChange({ microfarads: v })} />}
      {part.kind === "led" && (
        <div className="flex gap-2" role="group" aria-label="LED colour">
          {Object.entries(LED_COLORS).map(([c, hex]) => (
            <button key={c} onClick={() => onChange({ color: c as Part["color"] })} aria-pressed={part.color === c} title={c}
              className={`h-8 w-8 rounded-full border-2 ${part.color === c ? "border-white" : "border-transparent"}`} style={{ background: hex }} />
          ))}
        </div>
      )}
      {part.kind === "switch" && (
        <button onClick={() => onChange({ closed: !part.closed })} className="rounded-lg bg-[var(--flow)] px-3 py-2 text-sm font-semibold text-[var(--ink)]">{part.closed ? "Open the switch" : "Close the switch"}</button>
      )}
      <div className="flex gap-2">
        <button onClick={onRotate} className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">Rotate <kbd className="font-mono text-xs text-[var(--muted)]">R</kbd></button>
        <button onClick={onDelete} className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">Delete</button>
      </div>
    </div>
  );
}
