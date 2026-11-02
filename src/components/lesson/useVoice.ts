"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice for the tutor, using the browser's built-in speech services (free,
 * no extra vendor): speech recognition to talk, speech synthesis to listen.
 * Recognition isn't in every browser (notably Firefox), so callers check
 * `canListen` and fall back to typing.
 */

// Minimal types: speech recognition isn't in TypeScript's DOM library everywhere yet.
interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Plain text for reading aloud: no markdown symbols. */
export const speakable = (text: string) => text.replace(/\*\*?([^*]+)\*\*?/g, "$1").replace(/[#_`]/g, "").replace(/\s+/g, " ").trim();

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  for (const lang of ["en-NZ", "en-AU", "en-GB", "en"]) {
    const v = voices.find(x => x.lang.replace("_", "-").startsWith(lang));
    if (v) return v;
  }
  return undefined;
}

export function useVoice() {
  const [canListen, setCanListen] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const rec = useRef<Recognition | null>(null);

  // Detect support after mount so server and browser render the same markup.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCanListen(!!recognitionCtor());
    setCanSpeak(typeof window !== "undefined" && "speechSynthesis" in window);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => { rec.current?.abort(); if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text));
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-NZ";
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, []);

  /**
   * Start listening. `onText` gets the words so far as the student speaks;
   * `onDone` gets the final words when they stop (empty if nothing was heard).
   */
  const listen = useCallback((onText: (t: string) => void, onDone: (t: string) => void, onError: (msg: string) => void) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    stopSpeaking();
    rec.current?.abort();
    const r = new Ctor();
    r.lang = "en-NZ";
    r.interimResults = true;
    r.continuous = false;
    let finalText = "", interim = "";
    r.onresult = e => {
      interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript; else interim += res[0].transcript;
      }
      onText((finalText + interim).trim());
    };
    r.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") onError("The microphone is blocked. Allow it in your browser's site settings, or type instead.");
      else if (e.error !== "no-speech" && e.error !== "aborted") onError("Couldn't hear that. Try again, or type instead.");
    };
    r.onend = () => { setListening(false); rec.current = null; onDone((finalText || interim).trim()); };
    rec.current = r;
    setListening(true);
    r.start();
  }, [stopSpeaking]);

  const stopListening = useCallback(() => { rec.current?.stop(); }, []);

  return { canListen, canSpeak, listening, speaking, listen, stopListening, speak, stopSpeaking };
}
