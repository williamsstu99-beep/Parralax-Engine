import type { Part } from "@/engine/lens/circuit/board";
import type { ComponentResult } from "@/engine/truth/circuit/types";

export const G = 40; // px per grid unit inside the SVG

export const LED_COLORS: Record<string, string> = { red: "#FF5A5A", green: "#4DFF8E", blue: "#5AB0FF", white: "#F2F5FF", yellow: "#FFD84D" };

const WIRE = "#9AA8C7";

/**
 * Draws a part's symbol in local coordinates: centred on (0,0), terminals at
 * x = ±G, before rotation. Glows are drawn by the caller underneath.
 */
export function PartSymbol({ part, result, dim }: { part: Part; result?: ComponentResult; dim?: boolean }) {
  const lead = (x0: number, x1: number) => <line x1={x0} y1={0} x2={x1} y2={0} stroke={WIRE} strokeWidth={3} strokeLinecap="round" />;
  const op = dim ? 0.55 : 1;
  switch (part.kind) {
    case "battery":
      // + terminal is t1 (+x side)
      return (
        <g opacity={op}>
          {lead(-G, -6)}{lead(6, G)}
          <line x1={6} y1={-15} x2={6} y2={15} stroke="#FFB547" strokeWidth={3.5} strokeLinecap="round" />
          <line x1={-6} y1={-8} x2={-6} y2={8} stroke="#8C99B4" strokeWidth={6} strokeLinecap="round" />
          <text x={17} y={-11} fontSize={12} fill="#FFB547" fontWeight={600}>+</text>
        </g>
      );
    case "resistor": {
      let d = `M${-G} 0 L-18 0`;
      for (let k = 0; k < 6; k++) d += ` L${-15 + k * 6} ${k % 2 ? 7 : -7}`;
      d += ` L18 0 L${G} 0`;
      return <path d={d} fill="none" stroke="#D9A85B" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={op} />;
    }
    case "bulb": {
      const b = result?.brightness ?? 0;
      return (
        <g opacity={op}>
          {lead(-G, -14)}{lead(14, G)}
          <circle r={14} fill={`rgba(255,226,160,${0.08 + 0.75 * b})`} stroke="#EEF2FA" strokeWidth={2.5} />
          <path d="M-9.9 -9.9 L9.9 9.9 M9.9 -9.9 L-9.9 9.9" stroke="#EEF2FA" strokeWidth={2} />
        </g>
      );
    }
    case "led":
    case "diode": {
      const col = part.kind === "led" ? LED_COLORS[part.color ?? "red"] : "#EEF2FA";
      const b = part.kind === "led" ? result?.brightness ?? 0 : 0;
      return (
        <g opacity={op}>
          {lead(-G, -10)}{lead(10, G)}
          <path d="M-10 -11 L10 0 L-10 11 Z" fill={part.kind === "led" ? col : "none"} fillOpacity={0.25 + 0.75 * Math.min(1, b)} stroke={col} strokeWidth={2.2} strokeLinejoin="round" />
          <line x1={10} y1={-11} x2={10} y2={11} stroke={col} strokeWidth={2.6} strokeLinecap="round" />
          {part.kind === "led" && (
            <g stroke={col} strokeWidth={1.6} fill="none" strokeLinecap="round">
              <path d="M2 -14 L8 -22 M8 -22 L4 -21 M8 -22 L7 -18" />
              <path d="M9 -12 L15 -20 M15 -20 L11 -19 M15 -20 L14 -16" />
            </g>
          )}
        </g>
      );
    }
    case "capacitor":
      return (
        <g opacity={op}>
          {lead(-G, -5)}{lead(5, G)}
          <line x1={-5} y1={-13} x2={-5} y2={13} stroke="#B79CFF" strokeWidth={3.5} strokeLinecap="round" />
          <line x1={5} y1={-13} x2={5} y2={13} stroke="#B79CFF" strokeWidth={3.5} strokeLinecap="round" />
        </g>
      );
    case "switch":
      return (
        <g opacity={op}>
          {lead(-G, -14)}{lead(14, G)}
          <line x1={-14} y1={0} x2={part.closed ? 14 : 10} y2={part.closed ? 0 : -15} stroke="#EEF2FA" strokeWidth={3} strokeLinecap="round" />
          <circle cx={-14} cy={0} r={3.5} fill="#EEF2FA" />
          <circle cx={14} cy={0} r={3.5} fill="#EEF2FA" />
        </g>
      );
  }
}

/** Small icon version for the tray. */
export function TrayIcon({ part }: { part: Part }) {
  return (
    <svg viewBox={`${-G - 4} -26 ${2 * G + 8} 52`} className="h-9 w-[76px]" aria-hidden="true">
      <PartSymbol part={part} result={{ amps: 0, volts: 0, watts: 0, brightness: part.kind === "led" ? 0.7 : 0.3 }} />
    </svg>
  );
}
