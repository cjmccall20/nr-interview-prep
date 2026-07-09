/**
 * Timestamped think-aloud transcript for the verbal-communication coaching
 * feature. The Web Speech API provides no timing data, so the client stamps
 * each finalized speech chunk (and mic on/off transitions) with seconds since
 * the work phase began. Silence gaps are computed here and rendered as
 * explicit lines so the grading LLM never has to do time math.
 */

export interface TranscriptEvent {
  /** Seconds since the work-phase clock started. */
  t: number
  kind: "speech" | "mic_on" | "mic_off"
  /** Present for kind === "speech". */
  text?: string
}

export interface VerbalStats {
  micOnSeconds: number
  elapsedSeconds: number
  utteranceCount: number
  /** Longest stretch with the mic ON and no speech. */
  longestSilenceSeconds: number
}

/** Gaps at or above this (mic on, no speech) render as [silence …] lines. */
const SILENCE_RENDER_SECONDS = 30
/** Keep at most this many recent speech events in the grader block. */
const MAX_SPEECH_EVENTS = 60
/** Rough character budget for the grader block (server backstops too). */
const MAX_TRANSCRIPT_CHARS = 4000

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m === 0) return `${r}s`
  return r === 0 ? `${m}m` : `${m}m${String(r).padStart(2, "0")}s`
}

/**
 * Walk the event log accumulating mic-on time and silences. A "silence" is a
 * stretch with the mic listening and no finalized speech, including the
 * trailing stretch from the last event up to `nowSeconds`.
 */
export function computeVerbalStats(
  events: TranscriptEvent[],
  nowSeconds: number,
): VerbalStats {
  let micOn = false
  let micOnSince = 0
  let micOnSeconds = 0
  let lastVoiceAt = 0 // last speech or mic_on while listening
  let utteranceCount = 0
  let longestSilence = 0

  for (const ev of events) {
    if (ev.kind === "mic_on") {
      if (!micOn) {
        micOn = true
        micOnSince = ev.t
        lastVoiceAt = ev.t
      }
    } else if (ev.kind === "mic_off") {
      if (micOn) {
        micOn = false
        micOnSeconds += Math.max(0, ev.t - micOnSince)
        longestSilence = Math.max(longestSilence, ev.t - lastVoiceAt)
      }
    } else if (ev.kind === "speech") {
      utteranceCount++
      if (micOn) {
        longestSilence = Math.max(longestSilence, ev.t - lastVoiceAt)
        lastVoiceAt = ev.t
      }
    }
  }
  if (micOn) {
    micOnSeconds += Math.max(0, nowSeconds - micOnSince)
    longestSilence = Math.max(longestSilence, nowSeconds - lastVoiceAt)
  }

  return {
    micOnSeconds: Math.round(micOnSeconds),
    elapsedSeconds: Math.round(Math.max(0, nowSeconds)),
    utteranceCount,
    longestSilenceSeconds: Math.round(longestSilence),
  }
}

/**
 * Render the event log as a grader-readable block: timestamped quotes, mic
 * on/off lines, explicit [silence …] gaps, and a MIC SUMMARY totals line.
 * Returns "" when there are no events (mic never touched).
 */
export function formatTranscriptForGrader(
  events: TranscriptEvent[],
  nowSeconds: number,
): string {
  if (events.length === 0) return ""

  const stats = computeVerbalStats(events, nowSeconds)

  // Trim to the most recent speech events (mic events are cheap — keep all).
  const speechCount = events.filter((e) => e.kind === "speech").length
  let toSkip = Math.max(0, speechCount - MAX_SPEECH_EVENTS)
  let truncated = toSkip > 0
  const kept: TranscriptEvent[] = []
  let lastDroppedT: number | null = null
  for (const ev of events) {
    if (ev.kind === "speech" && toSkip > 0) {
      toSkip--
      lastDroppedT = ev.t
      continue
    }
    kept.push(ev)
  }
  // Text-less anchor at the last dropped utterance so the renderer doesn't
  // fabricate a [silence] gap over speech that was merely truncated away.
  if (lastDroppedT !== null) {
    kept.push({ t: lastDroppedT, kind: "speech" })
    kept.sort((a, b) => a.t - b.t)
  }

  const lines: string[] = []
  let micOn = false
  let lastVoiceAt: number | null = null

  const pushSilence = (from: number, to: number, open: boolean) => {
    if (to - from < SILENCE_RENDER_SECONDS) return
    lines.push(
      `[silence ${mmss(from)}–${mmss(to)} — ${formatDuration(to - from)} with the mic on, no speech${open ? ", ongoing" : ""}]`,
    )
  }

  for (const ev of kept) {
    if (ev.kind === "mic_on") {
      if (!micOn) {
        micOn = true
        lastVoiceAt = ev.t
        lines.push(`[${mmss(ev.t)}] mic on`)
      }
    } else if (ev.kind === "mic_off") {
      if (micOn) {
        if (lastVoiceAt !== null) pushSilence(lastVoiceAt, ev.t, false)
        micOn = false
        lastVoiceAt = null
        lines.push(`[${mmss(ev.t)}] mic off`)
      }
    } else if (ev.kind === "speech") {
      if (ev.text) {
        if (micOn && lastVoiceAt !== null) pushSilence(lastVoiceAt, ev.t, false)
        lines.push(`[${mmss(ev.t)}] "${ev.text.trim()}"`)
      }
      // Text-less events are truncation anchors: mark voice activity only.
      if (micOn) lastVoiceAt = ev.t
    }
  }
  // Trailing open-ended silence up to "now".
  if (micOn && lastVoiceAt !== null) pushSilence(lastVoiceAt, nowSeconds, true)

  // Character backstop: drop oldest lines (keep the summary intact).
  let body = lines.join("\n")
  while (body.length > MAX_TRANSCRIPT_CHARS && lines.length > 1) {
    lines.shift()
    truncated = true
    body = lines.join("\n")
  }

  const header = truncated
    ? "(earlier transcript truncated — the MIC SUMMARY totals below cover the full phase)\n"
    : ""
  const summary = `MIC SUMMARY: mic on ${mmss(stats.micOnSeconds)} of ${mmss(stats.elapsedSeconds)} elapsed, ${stats.utteranceCount} utterance${stats.utteranceCount === 1 ? "" : "s"}, longest silence ${formatDuration(stats.longestSilenceSeconds)}.`

  return `${header}${body}\n${summary}`
}
