"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, MicOff } from "lucide-react"

interface MicRecorderProps {
  /**
   * Called with finalized transcript chunks. The parent CACHES these (it does
   * not show them in an editable box) and sends them to the AI on submit.
   */
  onTranscript: (text: string) => void
  /**
   * Fires on real listening transitions (user/parent start & stop) — NOT on
   * the keep-alive auto-restarts that survive the browser's silence timeout.
   * The parent uses this to log mic on/off into the think-aloud transcript.
   */
  onListeningChange?: (listening: boolean) => void
  /** When this number increments, the mic stops (parent bumps it on submit). */
  stopSignal?: number
  /** When this number increments, the mic starts (parent nudge/banner). */
  startSignal?: number
  disabled?: boolean
}

// Minimal typings for the Web Speech API (not in lib.dom for all TS targets).
interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [i: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export default function MicRecorder({
  onTranscript,
  onListeningChange,
  stopSignal,
  startSignal,
  disabled,
}: MicRecorderProps) {
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  // Keep listening across the browser's automatic silence timeouts until the
  // user stops or the problem is submitted.
  const keepAliveRef = useRef(false)
  // Tracks whether the parent has been told we're listening, so keep-alive
  // restarts never emit spurious off/on transitions.
  const reportedListeningRef = useRef(false)
  const onListeningChangeRef = useRef(onListeningChange)
  onListeningChangeRef.current = onListeningChange

  function reportListening(next: boolean) {
    if (reportedListeningRef.current === next) return
    reportedListeningRef.current = next
    onListeningChangeRef.current?.(next)
  }

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null)
    return () => {
      keepAliveRef.current = false
      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore
      }
      reportListening(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Parent-driven stop (on submit).
  useEffect(() => {
    if (stopSignal === undefined || stopSignal === 0) return
    keepAliveRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignore
    }
    setListening(false)
    reportListening(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSignal])

  // Parent-driven start (mic recommendation banner / nudges).
  useEffect(() => {
    if (startSignal === undefined || startSignal === 0) return
    if (!keepAliveRef.current) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSignal])

  function beginRecognition() {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setSupported(false)
      return
    }
    const recognition = new Ctor()
    recognition.lang = "en-US"
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (e) => {
      let finalText = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0]?.transcript ?? ""
      }
      if (finalText) onTranscript(finalText.trim() + " ")
    }
    recognition.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        keepAliveRef.current = false
        setError(
          "Microphone blocked — enable it in your browser's site settings, then try again.",
        )
        setListening(false)
        reportListening(false)
      } else if (ev.error === "no-speech" || ev.error === "aborted") {
        // transient — onend will auto-restart if we're still keep-alive
      } else {
        setError("Voice input hiccuped — it will keep trying.")
      }
    }
    recognition.onend = () => {
      // Auto-restart to survive the browser's silence auto-stop, until the user
      // stops or the problem is submitted.
      if (keepAliveRef.current) {
        try {
          beginRecognition()
          return
        } catch {
          // fall through
        }
      }
      setListening(false)
      reportListening(false)
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
      reportListening(true)
    } catch {
      // start() throws if called too soon after a previous end; retry shortly.
      if (keepAliveRef.current) {
        setTimeout(() => {
          try {
            recognition.start()
            recognitionRef.current = recognition
            setListening(true)
            reportListening(true)
          } catch {
            setError("Could not start the microphone. Try again.")
            setListening(false)
            reportListening(false)
          }
        }, 250)
      }
    }
  }

  function start() {
    if (getRecognitionCtor() === null) {
      setSupported(false)
      return
    }
    setError(null)
    keepAliveRef.current = true
    beginRecognition()
  }

  function stop() {
    keepAliveRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignore
    }
    setListening(false)
    reportListening(false)
  }

  if (!supported) {
    return (
      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <MicOff className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span>
          Voice input needs Chrome, Edge, or Safari. Open this page there to
          think aloud, or narrate your reasoning in writing below.
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        className={`inline-flex items-center rounded font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          listening
            ? "gap-1.5 px-2.5 py-1.5 text-xs bg-red-600/20 text-red-300 border border-red-500/40 animate-pulse"
            : "gap-2 px-4 py-2.5 text-sm bg-amber-500/15 text-amber-200 border border-amber-500/50 hover:bg-amber-500/25 shadow-sm"
        }`}
        title={
          listening
            ? "Stop the mic"
            : "Recommended — narrate your reasoning aloud, like a real interview"
        }
      >
        {listening ? (
          <>
            <MicOff className="h-3.5 w-3.5" aria-hidden />
            Stop
          </>
        ) : (
          <>
            <Mic className="h-5 w-5" aria-hidden />
            Think aloud
          </>
        )}
      </button>
      {listening && (
        <div className="text-[11px] text-slate-400">
          Listening — keep narrating your reasoning. Your think-aloud is part of
          the evaluation, just like a real interview.
        </div>
      )}
      {error && <div className="text-[11px] text-amber-400">{error}</div>}
    </div>
  )
}
