# Voice input without audio retention

Operators can speak a debrief instead of typing it. Two rules bound the
feature. First, voice is an input method, not an artifact: the transcript is
the debrief, and audio is never persisted — not in Supabase, not in browser
storage, not on any server we run. Second, dictation only fills the same
textarea the operator could have typed into; they review and correct the
transcript (border names mis-hear easily) before pressing the unchanged
extract button, and the submitted text follows the exact capture path and
30-day retention of a typed debrief (ADR-0001). The capture trail records
nothing about modality — a spoken debrief is indistinguishable from a typed
one, per ADR-0001's no-capture-metadata line.

We transcribe with the browser's built-in Web Speech API (`en-GB`), which
means dictation audio transits the browser vendor's speech service
transiently. We accept that: the app itself never takes custody of audio.
Browsers without the API (or outside a secure context) simply don't show the
mic — typing is the first-class path everywhere.

## Why not the alternatives

Storing audio, even inside the 30-day window, crosses a line raw text does
not: a voice recording is a biometric identifier of research participants the
principles promise anonymity, and text can be anonymised while a voice
cannot. Server-side transcription (Whisper-class APIs) would buy accuracy,
but requires our servers to receive and hold raw audio — custody, a new
vendor, and proof-of-discard obligations — and loses the live on-screen
transcription that makes review-first natural.

## Consequences

There is no replay and no re-transcription: once heard, the audio is gone,
so transcript errors must be fixed by the operator before submission — the
review-first flow is load-bearing, not a nicety. Multilingual dictation is a
real future feature (transcription, translation, and extraction-prompt work
together), not a language dropdown. Any future storing of audio, flagging of
modality, or auto-submission of unreviewed transcripts is a revisit of this
ADR and ADR-0001, not a tweak.
