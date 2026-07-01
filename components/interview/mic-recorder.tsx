"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, MicOff } from "lucide-react"

interface MicRecorderProps {
  /**
   * Called with finalized transcript chunks. The parent CACHES these (it does
   * not show them in an editable box) and sends them to the AI on submit.
   */
  onTranscript: (text: string) => void
  /** When this number increments, the mic stops (parent bumps it on submit). */
  stopSignal?: number
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

export default function MicRecorder({ onTranscript, stopSignal, disabled }: MicRecorderProps) {
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  // Keep listening across the browser's automatic silence timeouts until the
  // user stops or the problem is submitted.
  const keepAliveRef = useRef(false)

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null)
    return () => {
      keepAliveRef.current = false
      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore
      }
    }
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
  }, [stopSignal])

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
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      // start() throws if called too soon after a previous end; retry shortly.
      if (keepAliveRef.current) {
        setTimeout(() => {
          try {
            recognition.start()
            recognitionRef.current = recognition
            setListening(true)
          } catch {
            setError("Could not start the microphone. Try again.")
            setListening(false)
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
  }

  if (!supported) {
    return (
      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <MicOff className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span>
          Voice input works in Google Chrome. Open this page in Chrome to dictate,
          or just type your answer below.
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
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          listening
            ? "bg-red-600/20 text-red-300 border border-red-500/40 animate-pulse"
            : "bg-[#334155] text-slate-200 hover:bg-[#475569] border border-[#475569]"
        }`}
        title={listening ? "Stop dictating" : "Dictate your answer (Chrome)"}
      >
        {listening ? (
          <>
            <MicOff className="h-3.5 w-3.5" aria-hidden />
            Stop
          </>
        ) : (
          <>
            <Mic className="h-3.5 w-3.5" aria-hidden />
            Speak answer
          </>
        )}
      </button>
      {listening && (
        <div className="text-[11px] text-slate-400">
          Listening — your spoken answer is captured and sent when you submit.
        </div>
      )}
      {error && <div className="text-[11px] text-amber-400">{error}</div>}
    </div>
  )
}
