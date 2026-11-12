"use client";

import { useEffect, useRef, useState } from "react";
import type { Control, ControlValue, Values } from "@/engine/kit/core";

function frameDoc(origin: string) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${origin}/kit/ 'unsafe-eval'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#0a2a31"><script src="${origin}/kit/runtime.js"></script></body></html>`;
}

/** Messages the simulation frame sends back. */
export type SimEvent =
  | { type: "ready"; controls: Control[]; title: string | null; warnings: string[] }
  | { type: "error"; errors: string[] }
  | { type: "caption"; text: string }
  | { type: "paused"; paused: boolean };

export type SimCommand = { type: "set"; label: string; value: ControlValue } | { type: "restart" };

/**
 * A sandboxed frame that runs one scene script. It has no network access
 * (its content policy only allows our runtime file) and can't touch this page:
 * the two talk only through messages.
 */
export default function SimFrame({ code, values, onEvent, commands, title }: {
  code: string; values: Values; onEvent: (e: SimEvent) => void;
  /** Receives a function the parent can call to send commands into the frame. */
  commands: (send: (c: SimCommand) => void) => void;
  title: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Only ever rendered after a user action, so window is available here.
  const [doc] = useState(() => (typeof window === "undefined" ? null : frameDoc(window.location.origin)));
  const [loaded, setLoaded] = useState(false);
  const latest = useRef({ code, values, onEvent });
  useEffect(() => { latest.current = { code, values, onEvent }; });

  useEffect(() => {
    const send = (c: SimCommand) => frame.current?.contentWindow?.postMessage(c, "*");
    commands(send);
  }, [commands]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const d = e.data as { source?: string } & SimEvent;
      if (d?.source !== "parallax-kit") return;
      latest.current.onEvent(d);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    frame.current?.contentWindow?.postMessage({ type: "load", code, values: latest.current.values }, "*");
  }, [code, loaded]);

  if (!doc) return null;
  return (
    <iframe ref={frame} srcDoc={doc} sandbox="allow-scripts" title={title} onLoad={() => setLoaded(true)}
      className="absolute inset-0 h-full w-full border-0" />
  );
}
