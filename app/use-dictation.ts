"use client";

// Toggle-contract wrapper around the browser's Web Speech API: once armed,
// the mic listens until the operator taps stop, transparently respawning the
// recognition session when the engine ends one on its own (iOS Safari does
// this after pauses). Finalised phrases stream out through onFinal; audio is
// never touched, stored, or uploaded by this app
// (docs/adr/0003-voice-input-without-audio-retention.md).

import { useCallback, useEffect, useRef, useState } from "react";
import { splitResults, type DictationChunk } from "@/lib/dictation";

// lib.dom has no SpeechRecognition typings yet, and Safari only ships the
// webkit-prefixed constructor — declare the minimal surface we use.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// Mic capture requires a secure context (HTTPS or localhost), so the button
// is not offered outside one even if the API object exists.
function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ??
    w.webkitSpeechRecognition ??
    null) as SpeechRecognitionCtor | null;
}

export interface Dictation {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useDictation(onFinal: (chunk: string) => void): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const armedRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const interimRef = useRef("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  // Detection runs after mount so the server render (no mic button) matches
  // the first client render.
  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
  }, []);

  useEffect(() => {
    return () => {
      armedRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  const commitInterim = useCallback(() => {
    if (interimRef.current) {
      onFinalRef.current(interimRef.current);
      interimRef.current = "";
      setInterim("");
    }
  }, []);

  const start = useCallback(() => {
    if (armedRef.current) return;
    setError(null);
    armedRef.current = true;

    // A fresh instance per session is the reliable path across engines —
    // reusing one after onend misbehaves on Safari.
    function spawn() {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        armedRef.current = false;
        setListening(false);
        return;
      }
      const recognition = new Ctor();
      recognition.lang = "en-GB";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        const chunks: DictationChunk[] = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          chunks.push({
            transcript: result[0]?.transcript ?? "",
            isFinal: result.isFinal,
          });
        }
        const { finals, interim: pending } = splitResults(chunks);
        for (const phrase of finals) onFinalRef.current(phrase);
        interimRef.current = pending;
        setInterim(pending);
      };

      recognition.onerror = (event) => {
        // "no-speech"/"aborted" are routine session ends — onend decides
        // whether to respawn. Real failures disarm with a message.
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          armedRef.current = false;
          setError(
            "Microphone access is blocked — allow it in the browser and try again, or just type.",
          );
        } else if (event.error === "network") {
          armedRef.current = false;
          setError(
            "Speech recognition needs a connection — check the signal and try again, or just type.",
          );
        }
      };

      recognition.onend = () => {
        // The engine can end a session with the last phrase still interim
        // (a pause, a quiet stretch): no final is coming, so commit it.
        commitInterim();
        if (armedRef.current) {
          spawn();
        } else {
          recognitionRef.current = null;
          setListening(false);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        // start() throws if a session is somehow already live; the live
        // session's own onend will respawn.
      }
    }

    spawn();
    setListening(true);
  }, [commitInterim]);

  const stop = useCallback(() => {
    armedRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop(); // onend commits pending interim + updates state
    } else {
      setListening(false);
    }
  }, []);

  return { supported, listening, interim, error, start, stop };
}
