"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, MicOff } from "lucide-react"

interface MicRecorderProps {
  /** Called with finalized transcript text; the parent appends it to its input. */
  onTranscript: (text: string) => void
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

export default function MicRecorder({ onTranscript, disabled }: MicRecorderProps) {
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null)
    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore
      }
    }
  }, [])

  function start() {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setSupported(false)
      return
    }
    setError(null)
    const recognition = new Ctor()
    recognition.lang = "en-US"
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (e) => {
      let finalText = ""
      let interimText = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const chunk = res[0]?.transcript ?? ""
        if (res.isFinal) finalText += chunk
        else interimText += chunk
      }
      if (finalText) {
        onTranscript(finalText.trim() + " ")
      }
      setInterim(interimText)
    }
    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError(
          "Microphone blocked — enable it in your browser's site settings, then try again.",
        )
      } else if (e.error === "no-speech") {
        setError("Didn't catch that — try speaking again.")
      } else if (e.error !== "aborted") {
        setError("Voice input hiccuped. Try again.")
      }
    }
    recognition.onend = () => {
      setListening(false)
      setInterim("")
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setListening(true)
    } catch {
      setError("Could not start the microphone. Try again.")
      setListening(false)
    }
  }

  function stop() {
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
      {listening && interim && (
        <div className="text-[11px] text-slate-400 italic truncate max-w-[260px]">
          {interim}
        </div>
      )}
      {error && <div className="text-[11px] text-amber-400">{error}</div>}
    </div>
  )
}
