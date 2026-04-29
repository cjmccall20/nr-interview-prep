"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  MessageSquare,
  PencilLine,
  Timer,
  Trash2,
  Lightbulb,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable-panels"
import Whiteboard from "./whiteboard"
import PhaseTimer from "./phase-timer"
import ChatLog, { type ChatMessage } from "./chat-log"
import FunFact from "./fun-fact"
import { MarkdownWithMath } from "./markdown-with-math"
import { streamEvaluation, requestHint } from "@/lib/interview/stream"
import { deleteSession, updateSession } from "@/lib/interview/session-store"
import type { PartSummary, Problem, SessionPhase } from "@/lib/interview/types"

interface SessionWorkspaceProps {
  sessionId: string
  problem: Problem
  initialPhase?: SessionPhase
  initialCurrentPartIndex?: number | null
  initialPartSummaries?: PartSummary[] | null
  onSessionComplete: () => void
}

const DEFAULT_DERIVATION_SECONDS = 300
const MOBILE_BREAKPOINT_PX = 768

function phaseConfig(problem: Problem) {
  const derivationDuration = problem.time_limit_seconds ?? DEFAULT_DERIVATION_SECONDS
  return {
    ttfp: { label: "Time to First Principle", duration: 60, whiteboardEnabled: false },
    derivation: { label: problem.parts_json ? "Capstone — Work" : "Derivation", duration: derivationDuration, whiteboardEnabled: true },
    review: { label: "Review", duration: 0, whiteboardEnabled: false },
    complete: { label: "Complete", duration: 0, whiteboardEnabled: false },
  }
}

function saveSessionUpdate(
  sessionId: string,
  fields: Parameters<typeof updateSession>[1],
) {
  try {
    updateSession(sessionId, fields)
  } catch (e) {
    console.error("Failed to save session update:", e)
  }
}

function normalizePhase(p: SessionPhase): SessionPhase {
  return p === "review" ? "complete" : p
}

function openingMessageFor(phase: SessionPhase, problem: Problem): string | null {
  if (phase === "ttfp") {
    return "You have 60 seconds to identify the governing first principle for this problem. Type your answer below — the whiteboard unlocks once we agree on the principle. The timer starts when you click into the text box."
  }
  if (phase === "derivation") {
    if (problem.parts_json && problem.parts_json.length > 0) {
      const mins = Math.round((problem.time_limit_seconds ?? DEFAULT_DERIVATION_SECONDS) / 60)
      return `Capstone mode: ${problem.parts_json.length} parts, ${mins}-minute timer spans the whole problem. Solve part (a) first — I will only advance you once you have justified the governing constraint, not just stated a number. Carry results forward as the parts chain.`
    }
    const mins = Math.round((problem.time_limit_seconds ?? DEFAULT_DERIVATION_SECONDS) / 60)
    return `Good. Now derive the result on the whiteboard — you have ${mins} minute${mins === 1 ? "" : "s"}. Use the text box to narrate or ask clarifying questions. Click 'Submit Whiteboard' when you want me to evaluate your work.`
  }
  return null
}

const PART_COMPLETE_RE = /\[PART_COMPLETE:\s*summary\s*=\s*"([^"]*)"\s*\]/

function useIsMobile(breakpoint = MOBILE_BREAKPOINT_PX): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [breakpoint])
  return isMobile
}

export default function SessionWorkspace({
  sessionId,
  problem,
  initialPhase = "ttfp",
  initialCurrentPartIndex = null,
  initialPartSummaries = null,
  onSessionComplete,
}: SessionWorkspaceProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const isCapstone = !!(problem.parts_json && problem.parts_json.length > 0)

  const startingPhase = isCapstone && initialPhase === "ttfp" ? "derivation" : normalizePhase(initialPhase)

  const [phase, setPhase] = useState<SessionPhase>(startingPhase)
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const opening = openingMessageFor(startingPhase, problem)
    return opening ? [{ role: "tutor", content: opening }] : []
  })
  const [streamingContent, setStreamingContent] = useState("")
  const [textInput, setTextInput] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [timerRunning, setTimerRunning] = useState(startingPhase === "derivation")
  const [hintTier, setHintTier] = useState(0)
  const [whiteboardImage, setWhiteboardImage] = useState<string | null>(null)
  const [connectionLost, setConnectionLost] = useState(false)
  const [currentPartIndex, setCurrentPartIndex] = useState<number | null>(
    isCapstone ? (initialCurrentPartIndex ?? 0) : null,
  )
  const [partSummaries, setPartSummaries] = useState<PartSummary[]>(initialPartSummaries ?? [])
  const [whiteboardClearSignal, setWhiteboardClearSignal] = useState(0)
  const [mobileView, setMobileView] = useState<"chat" | "whiteboard">(
    startingPhase === "derivation" ? "whiteboard" : "chat",
  )
  const [promptExpandedMobile, setPromptExpandedMobile] = useState(startingPhase === "ttfp")
  const [tutorBadge, setTutorBadge] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const phaseStartRef = useRef<number>(Date.now())
  const timerStartedRef = useRef<boolean>(startingPhase === "derivation")

  const config = phaseConfig(problem)[phase]

  useEffect(() => {
    if (initialPhase === "review") {
      saveSessionUpdate(sessionId, {
        phase: "complete",
        completed_at: new Date().toISOString(),
      })
    }
    if (isCapstone && initialPhase === "ttfp") {
      saveSessionUpdate(sessionId, { phase: "derivation", current_part_index: 0 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleOffline = () => setConnectionLost(true)
    const handleOnline = () => setConnectionLost(false)
    window.addEventListener("offline", handleOffline)
    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("offline", handleOffline)
      window.removeEventListener("online", handleOnline)
    }
  }, [])

  // Clear the mobile "new tutor message" badge when the user opens the chat.
  useEffect(() => {
    if (mobileView === "chat") setTutorBadge(false)
  }, [mobileView])

  const addMessage = useCallback((role: "user" | "tutor", content: string) => {
    setMessages((prev) => [...prev, { role, content }])
  }, [])

  function getConversationHistory(): { role: string; content: string }[] {
    return messages.slice(-6).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }))
  }

  async function handleSubmit(overrideText?: string, overrideImage?: string) {
    const text = overrideText ?? textInput.trim()
    const image = overrideImage ?? whiteboardImage
    if (!text && !image) return
    if (isSubmitting) return

    setIsSubmitting(true)
    setIsProcessing(true)
    setTimerRunning(false)

    const userText = text || "[Whiteboard submitted for review]"
    if (!overrideText) setTextInput("")
    addMessage("user", userText)

    const payload = {
      session_id: sessionId,
      phase,
      text_response: userText,
      whiteboard_image: image || undefined,
      conversation_history: getConversationHistory(),
      problem_context: {
        prompt_text: problem.prompt_text,
        first_principle_target: problem.first_principle_target,
        solution_outline: problem.solution_outline || undefined,
        parts_json: problem.parts_json || undefined,
        current_part_index: isCapstone ? currentPartIndex ?? 0 : undefined,
        part_summaries: isCapstone ? partSummaries : undefined,
      },
    }

    setStreamingContent("")
    abortRef.current = new AbortController()

    await streamEvaluation(
      payload,
      {
        onChunk: (content) => {
          setStreamingContent((prev) => prev + content)
        },
        onComplete: (fullResponse, phaseComplete) => {
          setStreamingContent("")
          addMessage("tutor", fullResponse)
          setIsProcessing(false)
          setIsSubmitting(false)
          if (isMobile && mobileView === "whiteboard") setTutorBadge(true)

          const partMatch = fullResponse.match(PART_COMPLETE_RE)
          if (isCapstone && partMatch && currentPartIndex !== null && problem.parts_json) {
            const label = problem.parts_json[currentPartIndex]?.label ?? `(${currentPartIndex + 1})`
            const summary = partMatch[1] || "Completed."
            const newSummaries = [...partSummaries, { label, summary }]
            setPartSummaries(newSummaries)

            const nextIdx = currentPartIndex + 1
            const totalParts = problem.parts_json.length
            if (nextIdx >= totalParts) {
              saveSessionUpdate(sessionId, {
                current_part_index: totalParts,
                part_summaries: newSummaries,
              })
              advancePhase()
            } else {
              setCurrentPartIndex(nextIdx)
              setWhiteboardImage(null)
              setWhiteboardClearSignal((n) => n + 1)
              setTimerRunning(true)
              saveSessionUpdate(sessionId, {
                current_part_index: nextIdx,
                part_summaries: newSummaries,
              })
              addMessage("tutor", `Accepted: ${label} ${summary}. On to ${problem.parts_json[nextIdx]?.label ?? `part ${nextIdx + 1}`} — canvas cleared.`)
            }
            return
          }

          if (phaseComplete) {
            advancePhase()
          } else {
            setTimerRunning(true)
          }
        },
        onError: (error) => {
          setStreamingContent("")
          addMessage("tutor", `[Connection error: ${error}. Try again.]`)
          setIsProcessing(false)
          setIsSubmitting(false)
          setTimerRunning(true)
        },
      },
      abortRef.current.signal,
    )
  }

  function advancePhase() {
    if (phase === "ttfp") {
      const ttfpSeconds = Math.round((Date.now() - phaseStartRef.current) / 1000)
      setPhase("derivation")
      setTimerRunning(true)
      timerStartedRef.current = true
      setWhiteboardImage(null)
      phaseStartRef.current = Date.now()
      // On phones, nudge the user toward the whiteboard once the principle is locked.
      if (isMobile) setMobileView("whiteboard")
      setPromptExpandedMobile(false)
      const opening = openingMessageFor("derivation", problem)
      if (opening) addMessage("tutor", opening)
      saveSessionUpdate(sessionId, { phase: "derivation", ttfp_seconds: ttfpSeconds })
    } else if (phase === "derivation") {
      setPhase("complete")
      setTimerRunning(false)
      if (isMobile) setMobileView("chat")
      saveSessionUpdate(sessionId, {
        phase: "complete",
        completed_at: new Date().toISOString(),
        total_hints: hintTier,
        flawless_execution: hintTier === 0,
      })
    }
  }

  function startTimerIfNeeded() {
    if (timerStartedRef.current) return
    if (phase !== "ttfp") return
    timerStartedRef.current = true
    setTimerRunning(true)
    phaseStartRef.current = Date.now()
  }

  function handleExit() {
    if (phase === "complete") {
      onSessionComplete()
      return
    }
    const confirmed = window.confirm(
      "Exit this problem? Your progress will be saved and you can resume later from the dashboard.",
    )
    if (confirmed) {
      abortRef.current?.abort()
      router.push("/interview")
    }
  }

  function handleEndAndDelete() {
    const confirmed = window.confirm(
      "End this problem and discard it? It will be removed from your in-progress list. This cannot be undone.",
    )
    if (!confirmed) return
    abortRef.current?.abort()
    try {
      deleteSession(sessionId)
    } catch (e) {
      console.error("Failed to delete session:", e)
    }
    router.push("/interview")
  }

  function handleTimerExpire() {
    setTimerRunning(false)
    if (phase === "ttfp") {
      addMessage("tutor", "Time's up for identifying the first principle. Let's move on — what governing law did you have in mind? Submit your best answer now.")
    } else if (phase === "derivation") {
      addMessage("tutor", "Time's up. Submit what you have — partial work is still valuable for feedback.")
    }
  }

  function handleWhiteboardExport(base64: string) {
    setWhiteboardImage(base64)
    if (phase === "derivation" || phase === "review") {
      const text = textInput.trim() || "Here is my whiteboard work."
      // On mobile, flip back to chat so the user can watch the fun fact / evaluation.
      if (isMobile) setMobileView("chat")
      handleSubmit(text, base64)
    }
  }

  async function handleHintRequest() {
    const nextTier = hintTier + 1
    if (nextTier > 3) return

    setHintTier(nextTier)

    try {
      const result = await requestHint({
        session_id: sessionId,
        hint_tier: nextTier,
        problem_context: { prompt_text: problem.prompt_text },
        first_principle_target: problem.first_principle_target,
      })

      addMessage("tutor", `[Hint ${nextTier}/3]: ${result.hint}`)
      if (isMobile) {
        setMobileView("chat")
      }
      saveSessionUpdate(sessionId, { total_hints: nextTier })
    } catch {
      addMessage("tutor", "[Could not generate hint. Try again.]")
      setHintTier(nextTier - 1)
    }
  }

  const phaseLabel = config.label
  const showTimer = phase === "ttfp" || phase === "derivation"
  const currentPart =
    isCapstone && currentPartIndex !== null && problem.parts_json
      ? problem.parts_json[currentPartIndex] ?? null
      : null

  // ---- Shared chat-pane content renderer -------------------------------
  // Used by both the desktop resizable panel and the mobile tab view.
  const renderChatPane = (opts: { mobile: boolean }) => (
    <div className="flex flex-col h-full relative">
      {/* Problem prompt: collapsible on mobile to give chat room to breathe. */}
      {opts.mobile ? (
        <div className="bg-[#0f172a] border-b border-[#334155]">
          <button
            type="button"
            onClick={() => setPromptExpandedMobile((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
            aria-expanded={promptExpandedMobile}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-blue-400 font-medium truncate">
                {problem.topic} — {problem.subtopic}
                {isCapstone && currentPart && (
                  <span className="ml-1.5 text-emerald-400">· {currentPart.label}</span>
                )}
              </div>
              {!promptExpandedMobile && (
                <div className="text-[11px] text-slate-500 truncate">
                  Tap to view the full problem statement
                </div>
              )}
            </div>
            {promptExpandedMobile ? (
              <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0 ml-2" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0 ml-2" />
            )}
          </button>
          {promptExpandedMobile && (
            <div className="px-4 pb-3 max-h-[40vh] overflow-y-auto">
              {isCapstone && currentPart ? (
                <>
                  <div className="text-slate-400 text-[11px] mb-2">Full problem:</div>
                  <div className="text-slate-300 text-xs leading-relaxed mb-3 opacity-70">
                    <MarkdownWithMath>{problem.prompt_text}</MarkdownWithMath>
                  </div>
                  <div className="border-t border-[#334155] pt-2">
                    <div className="text-xs text-emerald-400 font-medium mb-1">
                      Current part: {currentPart.label}
                    </div>
                    <div className="text-slate-200 text-sm leading-relaxed">
                      <MarkdownWithMath>{currentPart.prompt}</MarkdownWithMath>
                    </div>
                  </div>
                  {partSummaries.length > 0 && (
                    <div className="mt-3 border-t border-[#334155] pt-2">
                      <div className="text-[11px] text-slate-500 font-medium mb-1">
                        Accepted parts (carry forward)
                      </div>
                      <ul className="space-y-1">
                        {partSummaries.map((ps) => (
                          <li key={ps.label} className="text-[11px] text-emerald-300">
                            <span className="font-semibold">{ps.label}</span>:{" "}
                            <span className="text-slate-300">
                              <MarkdownWithMath className="inline">{ps.summary}</MarkdownWithMath>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-200 text-sm leading-relaxed">
                  <MarkdownWithMath>{problem.prompt_text}</MarkdownWithMath>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-[#0f172a] border-b border-[#334155] overflow-y-auto max-h-[50%]">
          <div className="text-xs text-blue-400 font-medium mb-1">
            {problem.topic} — {problem.subtopic}
            <span className="ml-2 text-slate-500">Difficulty {problem.difficulty}/5</span>
            {problem.tier && (
              <span className="ml-2 text-amber-400 uppercase tracking-wide">
                {problem.tier.replace("_", " ")}
              </span>
            )}
          </div>
          {isCapstone && currentPart ? (
            <>
              <div className="text-slate-400 text-xs mb-2">Full problem:</div>
              <div className="text-slate-300 text-xs leading-relaxed mb-3 opacity-70">
                <MarkdownWithMath>{problem.prompt_text}</MarkdownWithMath>
              </div>
              <div className="border-t border-[#334155] pt-3">
                <div className="text-xs text-emerald-400 font-medium mb-1">
                  Current part: {currentPart.label}
                </div>
                <div className="text-slate-200 text-sm leading-relaxed">
                  <MarkdownWithMath>{currentPart.prompt}</MarkdownWithMath>
                </div>
              </div>
              {partSummaries.length > 0 && (
                <div className="mt-3 border-t border-[#334155] pt-3">
                  <div className="text-xs text-slate-500 font-medium mb-1">
                    Accepted parts (carry these forward)
                  </div>
                  <ul className="space-y-1">
                    {partSummaries.map((ps) => (
                      <li key={ps.label} className="text-xs text-emerald-300">
                        <span className="font-semibold">{ps.label}</span>:{" "}
                        <span className="text-slate-300">
                          <MarkdownWithMath className="inline">{ps.summary}</MarkdownWithMath>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="text-slate-200 text-sm leading-relaxed">
              <MarkdownWithMath>{problem.prompt_text}</MarkdownWithMath>
            </div>
          )}
        </div>
      )}

      {/* Inline fun fact on desktop — tight banner above the chat log. */}
      {!opts.mobile && <FunFact visible={isProcessing} variant="inline" />}

      <ChatLog messages={messages} streamingContent={streamingContent} />

      {phase !== "complete" && (
        <div className="p-4 border-t border-[#334155]">
          <div className="text-xs text-slate-500 mb-1.5">
            {phase === "ttfp"
              ? "Step 1 of 2 — Name the governing principle (e.g., \"conservation of energy\"). Brief is fine; precision comes in the next step."
              : isCapstone
                ? `Work part ${currentPart?.label ?? ""} on the whiteboard, narrate here, and click 'Submit Whiteboard' when ready. I will only advance you after you justify the governing constraint.`
                : "Step 2 of 2 — Work the math on the whiteboard, then click 'Submit Whiteboard' on the right. Use this box to narrate or ask follow-ups."}
          </div>
          <textarea
            value={textInput}
            onChange={(e) => {
              setTextInput(e.target.value)
              startTimerIfNeeded()
            }}
            onFocus={startTimerIfNeeded}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit()
              }
            }}
            placeholder={
              phase === "ttfp"
                ? "e.g. \"Conservation of energy — the kinetic energy converts entirely to spring PE.\""
                : "Optional — narrate your approach, or just draw and hit Submit Whiteboard."
            }
            className="w-full h-20 px-3 py-2 bg-[#0f172a] border border-[#334155] rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            disabled={isSubmitting}
          />
          <div className="flex items-center justify-between mt-2 gap-2">
            <span className="text-[11px] text-slate-600 hidden sm:inline">
              Cmd+Enter to submit
            </span>
            <button
              onClick={() => handleSubmit()}
              disabled={(!textInput.trim() && !whiteboardImage) || isSubmitting}
              className="ml-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/30 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isSubmitting
                ? "Evaluating..."
                : phase === "ttfp"
                  ? "Lock in Principle"
                  : "Submit Text"}
            </button>
          </div>
        </div>
      )}

      {phase === "complete" && (
        <div className="p-6 border-t border-[#334155] text-center">
          <div className="text-emerald-400 text-xl font-semibold mb-1">
            Problem Complete
          </div>
          <div className="text-slate-400 text-sm mb-4">
            {hintTier === 0
              ? "Flawless execution — no consults requested."
              : `${hintTier} consult${hintTier !== 1 ? "s" : ""} used.`}
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onSessionComplete}
              className="w-full sm:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
            >
              Return to Dashboard
            </button>
            <button
              onClick={() => router.push("/interview")}
              className="w-full sm:w-auto px-6 py-2 bg-[#334155] hover:bg-[#475569] text-white text-sm rounded-lg"
            >
              Pick Next Problem
            </button>
          </div>
        </div>
      )}

      {/* Full-pane fun-fact overlay on mobile while evaluating. */}
      {opts.mobile && <FunFact visible={isProcessing} variant="overlay" />}
    </div>
  )

  const whiteboardNode = (
    <Whiteboard
      onExport={handleWhiteboardExport}
      disabled={!config.whiteboardEnabled || isSubmitting}
      disabledReason={
        phase === "ttfp"
          ? "Name the governing first principle in the chat to unlock the whiteboard."
          : isSubmitting
            ? "Evaluating your submission…"
            : undefined
      }
      clearSignal={whiteboardClearSignal}
    />
  )

  return (
    <div className="h-[100dvh] flex flex-col bg-[#0f172a]">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-[#1e293b] border-b border-[#334155] gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={handleExit}
            className="text-slate-400 hover:text-white text-sm flex items-center gap-1 flex-shrink-0"
            title="Return to dashboard"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <h2 className="text-white font-semibold text-sm hidden md:block flex-shrink-0">
            NR Interview Prep
          </h2>
          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            {(isCapstone ? (["derivation", "complete"] as const) : (["ttfp", "derivation", "complete"] as const)).map((p, i, arr) => {
              const order = ["ttfp", "derivation", "review", "complete"]
              const currentIdx = order.indexOf(phase)
              const pIdx = order.indexOf(p)
              return (
                <div key={p} className="flex items-center gap-1">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      p === phase || (p === "complete" && phase === "review")
                        ? "bg-blue-500"
                        : pIdx < currentIdx
                          ? "bg-emerald-500"
                          : "bg-[#475569]"
                    }`}
                  />
                  {i < arr.length - 1 && <div className="w-4 h-px bg-[#475569]" />}
                </div>
              )
            })}
          </div>
          <span className="text-[11px] sm:text-xs text-slate-400 bg-[#334155] px-2 py-0.5 rounded truncate">
            {phaseLabel}
            {isCapstone && currentPart && ` · ${currentPart.label}`}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {showTimer && (
            <PhaseTimer
              duration={config.duration}
              running={timerRunning}
              onExpire={handleTimerExpire}
              paused={connectionLost}
            />
          )}
          {hintTier < 3 && phase !== "complete" && (
            <button
              onClick={handleHintRequest}
              disabled={isProcessing}
              className="px-2 sm:px-3 py-1.5 text-xs text-yellow-400 border border-yellow-500/30 rounded hover:bg-yellow-500/10 disabled:opacity-30 flex items-center gap-1"
              title={`Request a consult (${3 - hintTier} left)`}
            >
              <Lightbulb className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Request Consult</span>
              <span className="hidden sm:inline">({3 - hintTier} left)</span>
              <span className="sm:hidden">{3 - hintTier}</span>
            </button>
          )}
          {phase !== "complete" && (
            <button
              onClick={handleEndAndDelete}
              className="px-2 sm:px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 flex items-center gap-1"
              title="Discard this problem"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Discard</span>
            </button>
          )}
        </div>
      </div>

      {connectionLost && (
        <div className="bg-orange-500/10 border-b border-orange-500/30 px-4 py-2 text-center">
          <span className="text-orange-400 text-sm">
            Comms dropped. Re-establishing connection... Timer paused.
          </span>
        </div>
      )}

      {isMobile ? (
        <>
          <div className="flex-1 overflow-hidden relative">
            <div className={mobileView === "chat" ? "h-full" : "hidden"}>
              {renderChatPane({ mobile: true })}
            </div>
            <div className={mobileView === "whiteboard" ? "h-full" : "hidden"}>
              {whiteboardNode}
            </div>
          </div>

          {/* Mobile bottom tab bar */}
          <nav
            className="grid grid-cols-2 border-t border-[#334155] bg-[#1e293b]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
            aria-label="View switcher"
          >
            <button
              onClick={() => setMobileView("chat")}
              className={`flex flex-col items-center justify-center py-2.5 text-xs font-medium relative transition-colors ${
                mobileView === "chat"
                  ? "text-blue-400 bg-blue-500/5"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              aria-pressed={mobileView === "chat"}
            >
              <MessageSquare className="h-5 w-5 mb-0.5" aria-hidden />
              <span>Chat</span>
              {tutorBadge && mobileView !== "chat" && (
                <span className="absolute top-1.5 right-[35%] h-2 w-2 rounded-full bg-blue-400 ring-2 ring-[#1e293b]" />
              )}
            </button>
            <button
              onClick={() => setMobileView("whiteboard")}
              disabled={!config.whiteboardEnabled}
              className={`flex flex-col items-center justify-center py-2.5 text-xs font-medium transition-colors ${
                mobileView === "whiteboard"
                  ? "text-blue-400 bg-blue-500/5"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
              aria-pressed={mobileView === "whiteboard"}
              title={
                !config.whiteboardEnabled
                  ? "Lock in a first principle to unlock the whiteboard"
                  : undefined
              }
            >
              <PencilLine className="h-5 w-5 mb-0.5" aria-hidden />
              <span>Whiteboard</span>
            </button>
          </nav>
        </>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={40} minSize={30}>
              {renderChatPane({ mobile: false })}
            </ResizablePanel>

            <ResizableHandle className="w-1 bg-[#334155] hover:bg-blue-500/50 transition-colors" />

            <ResizablePanel defaultSize={60} minSize={30}>
              {whiteboardNode}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  )
}
