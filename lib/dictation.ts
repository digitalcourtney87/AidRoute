// Pure text-assembly helpers for voice dictation. The Web Speech API wiring
// lives in app/use-dictation.ts; everything testable without a browser lives
// here. Audio never reaches this module — dictation is text by the time the
// app sees it (docs/adr/0003-voice-input-without-audio-retention.md).

// Appends a finalised dictation chunk to the operator's existing text. The
// operator owns the textarea: whitespace they typed themselves (trailing
// spaces, blank lines) is preserved verbatim; otherwise a single space
// separates the old text from the new chunk.
export function appendTranscript(existing: string, addition: string): string {
  const add = addition.trim();
  if (!add) return existing;
  if (!existing) return add;
  if (/\s$/.test(existing)) return existing + add;
  return `${existing} ${add}`;
}

export interface DictationChunk {
  transcript: string;
  isFinal: boolean;
}

// Splits one SpeechRecognition result batch (from event.resultIndex onward)
// into newly-finalised phrases and the current in-flight interim guess. The
// engine re-delivers the whole interim hypothesis each event, so interim
// replaces rather than accumulates.
export function splitResults(chunks: DictationChunk[]): {
  finals: string[];
  interim: string;
} {
  const finals: string[] = [];
  let interim = "";
  for (const chunk of chunks) {
    if (chunk.isFinal) {
      const phrase = chunk.transcript.trim();
      if (phrase) finals.push(phrase);
    } else {
      interim += chunk.transcript;
    }
  }
  return { finals, interim: interim.trim() };
}
