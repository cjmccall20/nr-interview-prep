"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { Problem, ProblemTier, Session } from "@/lib/interview/types"
import { PROBLEMS } from "@/lib/interview/problems"
import {
  clearAllProgress,
  createSession,
  createSessionForProblem,
  deleteSession,
  listSessions,
  migrateLegacyPhases,
} from "@/lib/interview/session-store"
import {
  getWeaknessRanking,
  type WeaknessRow,
} from "@/lib/interview/progress-store"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MarkdownWithMath } from "@/components/interview/markdown-with-math"

const TIER_ORDER: ProblemTier[] = ["basic", "intermediate", "difficult", "capstone"]
const TIER_LABELS: Record<ProblemTier, string> = {
  basic: "Basic",
  intermediate: "Intermediate",
  difficult: "Difficult",
  capstone: "Capstone",
  naval_reactor: "Naval Reactor",
}
const SUBJECT_TOPICS: Record<"Calculus" | "Physics", string[]> = {
  Calculus: ["Basic Calculus", "Calculus"],
  Physics: ["Basic Physics", "Physics"],
}

const MAJOR_SPECIFIC_GROUPS = [
  {
    label: "General Technical",
    topics: [
      { topic: "Chemistry", subtopic: "pH" },
      { topic: "Chemistry", subtopic: "Ideal Gas Law" },
      { topic: "Circuits", subtopic: "Basic RLC" },
    ],
  },
  {
    label: "Electrical Engineering",
    topics: [
      { topic: "EE", subtopic: "Control Systems" },
      { topic: "EE", subtopic: "AC/DC Circuit Analysis" },
      { topic: "EE", subtopic: "Electromagnetic Induction" },
      { topic: "EE", subtopic: "Advanced RLC" },
      { topic: "EE", subtopic: "Transformer Theory" },
    ],
  },
  {
    label: "Chemical Engineering",
    topics: [
      { topic: "ChemE", subtopic: "Concentration & Dilution" },
      { topic: "ChemE", subtopic: "Gibbs & Helmholtz Energy" },
      { topic: "ChemE", subtopic: "pH Calculations" },
      { topic: "ChemE", subtopic: "Gas Laws" },
      { topic: "ChemE", subtopic: "Crystal Structures & Materials" },
    ],
  },
  {
    label: "Mechanical / Aerospace / Civil",
    topics: [
      { topic: "MechE", subtopic: "Stress/Strain" },
      { topic: "MechE", subtopic: "Fluids" },
      { topic: "MechE", subtopic: "Thermodynamics" },
      { topic: "MechE", subtopic: "Heat Transfer" },
      { topic: "MechE", subtopic: "Materials & Manufacturing" },
    ],
  },
  {
    label: "Nuclear Engineering",
    topics: [
      { topic: "NukeE", subtopic: "Neutron Life Cycle" },
      { topic: "NukeE", subtopic: "Cross Sections" },
      { topic: "NukeE", subtopic: "Radiation & Shielding" },
    ],
  },
  {
    label: "Computer Science",
    topics: [
      { topic: "CS", subtopic: "Boolean Algebra" },
      { topic: "CS", subtopic: "Semiconductor Theory" },
      { topic: "CS", subtopic: "Probability & Statistics" },
    ],
  },
  {
    label: "Additional Math",
    topics: [
      { topic: "Math", subtopic: "Taylor Series" },
      { topic: "Math", subtopic: "Triple Integrals" },
      { topic: "Math", subtopic: "Probability & Statistics" },
    ],
  },
]

const WELCOME_DISMISS_KEY = "nupoc_welcome_banner_dismissed_this_session"

// Truncates without severing a `$...$` math span: if the cut lands inside
// math, back up to the last opening `$`. Keeps KaTeX rendering well-formed.
function truncateMath(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  let slice = text.slice(0, maxLen)
  const dollars = (slice.match(/\$/g) || []).length
  if (dollars % 2 === 1) {
    slice = slice.slice(0, slice.lastIndexOf("$"))
  }
  return slice.trimEnd() + "…"
}

export default function InterviewDashboard() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [startingSession, setStartingSession] = useState(false)
  const [solvedExpanded, setSolvedExpanded] = useState(false)
  const [inProgressExpanded, setInProgressExpanded] = useState(true)
  const [welcomeDismissed, setWelcomeDismissed] = useState(true)
  const [weakness, setWeakness] = useState<WeaknessRow[]>([])

  useEffect(() => {
    migrateLegacyPhases()
    setSessions(listSessions())
    setWeakness(getWeaknessRanking())
    setLoading(false)
    if (typeof window !== "undefined") {
      const dismissed = window.sessionStorage.getItem(WELCOME_DISMISS_KEY)
      setWelcomeDismissed(dismissed === "1")
    }
  }, [])

  function dismissWelcome() {
    setWelcomeDismissed(true)
    try {
      window.sessionStorage.setItem(WELCOME_DISMISS_KEY, "1")
    } catch {}
  }

  function startSession(opts: {
    topic?: string
    subtopic?: string
    tier?: ProblemTier
    topics?: string[]
  }) {
    setStartingSession(true)
    try {
      const session = createSession(opts)
      if (!session) {
        window.alert("No problems match that selection. Try a different tier or topic.")
        return
      }
      router.push(`/interview/session/${session.id}`)
    } catch (error) {
      console.error("Failed to start session:", error)
    } finally {
      setStartingSession(false)
    }
  }

  function discardSession(sessionId: string) {
    const ok = window.confirm(
      "Discard this in-progress problem? It will be removed from your list.",
    )
    if (!ok) return
    try {
      deleteSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch (error) {
      console.error("Failed to discard session:", error)
    }
  }

  function handleClearAll() {
    const ok = window.confirm(
      "Clear all progress and start over? Every question becomes fresh and re-attemptable. Your long-term “Areas to Review” history is kept.",
    )
    if (!ok) return
    try {
      clearAllProgress()
      setSessions([])
    } catch (error) {
      console.error("Failed to clear progress:", error)
    }
  }

  function retryProblem(problemId: string) {
    setStartingSession(true)
    try {
      const session = createSessionForProblem(problemId)
      if (!session) {
        window.alert("Could not start a retry for that problem.")
        return
      }
      router.push(`/interview/session/${session.id}`)
    } catch (error) {
      console.error("Failed to retry problem:", error)
    } finally {
      setStartingSession(false)
    }
  }

  const problems = PROBLEMS
  const completedSessions = sessions.filter((s) => s.phase === "complete")
  const inProgressSessions = sessions.filter((s) => s.phase !== "complete")
  const flawlessSessions = completedSessions.filter((s) => s.flawless_execution)

  const capstonesCompleted = completedSessions.filter((s) => {
    const p = problems.find((pp) => pp.id === s.problem_id)
    return p?.tier === "capstone"
  }).length
  const capstonesTotal = problems.filter((p) => p.tier === "capstone").length
  const allCapstonesDone = capstonesTotal > 0 && capstonesCompleted >= capstonesTotal

  const completedProblemIds = new Set(completedSessions.map((s) => s.problem_id))

  const completedByTopic = new Map<string, number>()
  for (const s of completedSessions) {
    const p = problems.find((prob) => prob.id === s.problem_id)
    if (p) {
      const key = `${p.topic}::${p.subtopic}`
      completedByTopic.set(key, (completedByTopic.get(key) || 0) + 1)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
      {!welcomeDismissed && (
        <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/10 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-white font-semibold text-lg mb-2">
                Welcome to the NR Interview Prep Simulator
              </h2>
              <p className="text-slate-300 text-sm mb-3">
                Five tiers. Work through them in order:
              </p>
              <ul className="text-sm text-slate-300 space-y-1.5 mb-3">
                <li><span className="text-slate-400 font-medium">Basic</span> — sanity checks on the fundamentals.</li>
                <li><span className="text-slate-400 font-medium">Intermediate</span> — standard interview material.</li>
                <li><span className="text-slate-400 font-medium">Difficult</span> — stretch problems.</li>
                <li><span className="text-amber-400 font-medium">Capstone</span> — multi-part, 15 minutes, gated. Solve these unassisted and you&apos;re interview-ready.</li>
                <li><span className="text-red-400 font-medium">Naval Reactor</span> — post-capstone bonus. Submarine-specific: heat transfer, emergency blow, electrical fault, reactor kinetics. Optional stretch.</li>
              </ul>
              <p className="text-slate-400 text-xs">
                <span className="font-medium text-slate-300">Tip:</span> if you can borrow an iPad or drawing tablet, do. Hand-drawing is far more natural than a mouse for these problems.
              </p>
              <p className="text-slate-500 text-xs mt-2">
                Your progress is stored locally in this browser only — clearing site data resets it.
              </p>
            </div>
            <button
              onClick={dismissWelcome}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded border border-[#334155] whitespace-nowrap"
              title="Dismiss for this session"
            >
              Dismiss ×
            </button>
          </div>
        </div>
      )}

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">NR Interview Prep</h1>
            <p className="text-slate-400 mt-1 text-sm sm:text-base">
              Socratic AI tutor for Naval Reactors interview prep
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="sm:text-right">
              <div className="text-sm text-slate-500">Sessions completed</div>
              <div className="text-2xl font-bold text-emerald-400">
                {completedSessions.length}
              </div>
            </div>
            {sessions.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-red-400 border border-red-500/30 rounded px-3 py-1.5 hover:bg-red-500/10 whitespace-nowrap"
                title="Clear all progress and start over (keeps long-term weakness history)"
              >
                Clear all progress
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-6">
          <div className="bg-[#1e293b] rounded-lg p-4 border border-[#334155]">
            <div className="text-slate-400 text-sm">Problems Attempted</div>
            <div className="text-xl font-bold text-white">{sessions.length}</div>
          </div>
          <div className="bg-[#1e293b] rounded-lg p-4 border border-[#334155]">
            <div className="text-slate-400 text-sm">Flawless Executions</div>
            <div className="text-xl font-bold text-emerald-400">{flawlessSessions.length}</div>
          </div>
          <div className="bg-[#1e293b] rounded-lg p-4 border border-[#334155]">
            <div className="text-slate-400 text-sm">Completion Rate</div>
            <div className="text-xl font-bold text-blue-400">
              {sessions.length > 0
                ? `${Math.round((completedSessions.length / sessions.length) * 100)}%`
                : "—"}
            </div>
          </div>
        </div>
      </div>

      {inProgressSessions.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setInProgressExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-left mb-3"
          >
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-blue-400">{inProgressExpanded ? "▾" : "▸"}</span>
              In Progress
              <span className="text-sm text-slate-500 font-normal">
                ({inProgressSessions.length})
              </span>
            </h2>
          </button>
          {inProgressExpanded && (
            <div className="space-y-2">
              {inProgressSessions.map((s) => {
                const p = problems.find((prob) => prob.id === s.problem_id)
                return (
                  <div
                    key={s.id}
                    className="p-4 rounded-lg border bg-blue-600/10 border-blue-500/30 hover:border-blue-500/60 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <button
                        onClick={() => router.push(`/interview/session/${s.id}`)}
                        className="flex-1 text-left"
                      >
                        <div className="text-white font-medium text-sm">
                          {p ? `${p.topic} — ${p.subtopic}` : "Problem"}
                        </div>
                        {p && (
                          <div className="text-slate-300 text-sm mt-1.5 leading-snug">
                            <MarkdownWithMath>{truncateMath(p.prompt_text, 200)}</MarkdownWithMath>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">
                            {s.phase === "ttfp"
                              ? "Identify Principle"
                              : s.phase === "derivation"
                                ? "Derivation"
                                : "Review"}
                          </span>
                          <span className="text-xs text-slate-500">
                            Started {new Date(s.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </button>
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => router.push(`/interview/session/${s.id}`)}
                          className="px-3 py-1 text-xs text-blue-400 border border-blue-500/40 rounded hover:bg-blue-500/10"
                        >
                          Resume
                        </button>
                        <button
                          onClick={() => discardSession(s.id)}
                          className="px-3 py-1 text-xs text-red-400 border border-red-500/30 rounded hover:bg-red-500/10"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {completedSessions.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setSolvedExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-left mb-3"
          >
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-emerald-400">{solvedExpanded ? "▾" : "▸"}</span>
              Solved Problems
              <span className="text-sm text-slate-500 font-normal">
                ({completedSessions.length})
              </span>
            </h2>
          </button>
          {solvedExpanded && (
            <div className="space-y-2">
              {completedSessions.map((s) => {
                const p = problems.find((prob) => prob.id === s.problem_id)
                return (
                  <div
                    key={s.id}
                    className="p-4 rounded-lg bg-[#1e293b] border border-emerald-500/20"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="text-white font-medium text-sm">
                          {p ? `${p.topic} — ${p.subtopic}` : "Problem"}
                        </div>
                        {p && (
                          <div className="text-slate-300 text-sm mt-1.5 leading-snug">
                            <MarkdownWithMath>{truncateMath(p.prompt_text, 220)}</MarkdownWithMath>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          <span>{new Date(s.created_at).toLocaleDateString()}</span>
                          {s.ttfp_seconds != null && <span>TTFP: {s.ttfp_seconds}s</span>}
                          {s.total_hints > 0 && <span>Consults: {s.total_hints}</span>}
                          {p && <span>Difficulty {p.difficulty}/5</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {s.flawless_execution && (
                          <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded whitespace-nowrap">
                            Flawless
                          </span>
                        )}
                        <button
                          onClick={() => retryProblem(s.problem_id)}
                          disabled={startingSession}
                          className="px-3 py-1 text-xs text-blue-400 border border-blue-500/40 rounded hover:bg-blue-500/10 disabled:opacity-40 whitespace-nowrap"
                          title="Attempt this problem again from scratch"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {weakness.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            Areas to Review
          </h2>
          <p className="text-slate-400 text-sm mt-1 mb-3">
            Where you&apos;ve leaned on hints or missed clean runs over time. This
            history persists even when you clear progress.
          </p>
          <div className="space-y-2">
            {weakness.slice(0, 5).map((w) => {
              const flawlessRate =
                w.completions > 0
                  ? Math.round((w.flawless / w.completions) * 100)
                  : 0
              const level =
                w.weaknessScore >= 0.6
                  ? { label: "Needs work", cls: "text-red-400 border-red-500/30 bg-red-500/5" }
                  : w.weaknessScore >= 0.3
                    ? { label: "Shaky", cls: "text-amber-400 border-amber-500/30 bg-amber-500/5" }
                    : { label: "Solid", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" }
              return (
                <div
                  key={w.topic}
                  className="p-4 rounded-lg bg-[#1e293b] border border-[#334155] flex items-start justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{w.topic}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded border ${level.cls}`}>
                        {level.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {w.completions} solved · {flawlessRate}% flawless · {w.totalHints}{" "}
                      consult{w.totalHints !== 1 ? "s" : ""} used
                    </div>
                    {w.topConcepts.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {w.topConcepts.map((c) => (
                          <li
                            key={c.concept}
                            className="text-[11px] text-slate-300 bg-[#0f172a] border border-[#334155] rounded px-2 py-0.5"
                          >
                            {c.concept}
                            {c.count > 1 ? ` ×${c.count}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    onClick={() => startSession({ topic: w.topic })}
                    disabled={startingSession}
                    className="px-3 py-1.5 text-xs text-blue-400 border border-blue-500/40 rounded hover:bg-blue-500/10 disabled:opacity-40 whitespace-nowrap"
                  >
                    Practice this
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-white text-sm font-medium">
            Not ready to start working on problems?
          </p>
          <p className="text-slate-300 text-xs mt-0.5">
            Review the key concepts here &mdash; equation sheet plus context for every NUPOC topic.
          </p>
        </div>
        <Link
          href="/interview/teach"
          className="shrink-0 text-center text-sm px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
        >
          Teach me the basics &rarr;
        </Link>
      </div>

      <div className="mb-10">
        <h2 className="text-xl font-semibold text-white">Core Interview Prep</h2>
        <p className="text-slate-400 text-sm mt-1 mb-4">
          Calculus and physics are tested in every NUPOC interview regardless of major. Work up the tier ladder.
        </p>
        {loading ? (
          <div className="text-slate-400 text-center py-12">Loading problems...</div>
        ) : (
          <div className="space-y-5">
            <SubjectCard
              subject="Calculus"
              problems={problems}
              completedProblemIds={completedProblemIds}
              startingSession={startingSession}
              onStart={startSession}
            />
            <SubjectCard
              subject="Physics"
              problems={problems}
              completedProblemIds={completedProblemIds}
              startingSession={startingSession}
              onStart={startSession}
            />
          </div>
        )}
      </div>

      {!loading && (
        <div className="mb-10">
          <h2 className="text-xl font-semibold text-white">Major-Specific Topics</h2>
          <p className="text-slate-400 text-sm mt-1 mb-4">
            Discipline-specific content. Pick topics that match the major you&apos;re interviewing under.
          </p>
          <div className="space-y-8">
            {MAJOR_SPECIFIC_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-lg font-medium text-white">{group.label}</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                  {group.topics.map(({ topic, subtopic }) => {
                    const topicProblems = problems.filter(
                      (p) => p.topic === topic && p.subtopic === subtopic,
                    )
                    const total = topicProblems.length
                    const completed = completedByTopic.get(`${topic}::${subtopic}`) || 0
                    const unattempted = topicProblems.filter(
                      (p) => !completedProblemIds.has(p.id),
                    ).length

                    return (
                      <button
                        key={`${topic}-${subtopic}`}
                        onClick={() => startSession({ topic, subtopic })}
                        disabled={startingSession || total === 0}
                        className="text-left p-4 rounded-lg border bg-[#1e293b] border-[#334155] hover:border-blue-500/50 hover:bg-[#1e293b]/80 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <div className="font-medium text-white">{subtopic}</div>
                        <div className="flex items-center flex-wrap gap-2 mt-2 text-xs">
                          <span className="text-slate-500">
                            {total} problem{total !== 1 ? "s" : ""}
                          </span>
                          {completed > 0 && (
                            <span className="text-emerald-500">{completed} solved</span>
                          )}
                          {unattempted > 0 && (
                            <span className="text-blue-400/80">{unattempted} new</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && (
        <NavalReactorSection
          problems={problems}
          completedProblemIds={completedProblemIds}
          unlocked={allCapstonesDone}
          capstonesCompleted={capstonesCompleted}
          capstonesTotal={capstonesTotal}
          startingSession={startingSession}
          onStart={startSession}
        />
      )}
    </div>
  )
}

type StartOpts = { topic?: string; subtopic?: string; tier?: ProblemTier; topics?: string[] }

interface SubjectCardProps {
  subject: "Calculus" | "Physics"
  problems: Problem[]
  completedProblemIds: Set<string>
  startingSession: boolean
  onStart: (opts: StartOpts) => void
}

function SubjectCard({
  subject,
  problems,
  completedProblemIds,
  startingSession,
  onStart,
}: SubjectCardProps) {
  const subjectTopics = SUBJECT_TOPICS[subject]
  const subjectProblems = useMemo(
    () => problems.filter((p) => subjectTopics.includes(p.topic)),
    [problems, subjectTopics],
  )

  const tierProblems = useMemo(() => {
    const m = new Map<ProblemTier, Problem[]>()
    for (const t of TIER_ORDER) m.set(t, [])
    for (const p of subjectProblems) {
      if (p.tier && m.has(p.tier)) m.get(p.tier)!.push(p)
    }
    return m
  }, [subjectProblems])

  const defaultTier = useMemo(
    () => firstIncompleteTier(subjectProblems, completedProblemIds),
    [subjectProblems, completedProblemIds],
  )

  const storageKey = subject === "Calculus" ? "nupoc_tab_calc" : "nupoc_tab_phys"
  const [activeTier, setActiveTier] = useState<ProblemTier>(defaultTier)
  const hydratedRef = useRef(false)

  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    if (typeof window === "undefined") return
    const saved = window.sessionStorage.getItem(storageKey) as ProblemTier | null
    if (saved && TIER_ORDER.includes(saved)) {
      setActiveTier(saved)
    } else {
      setActiveTier(defaultTier)
    }
  }, [defaultTier, storageKey])

  function onTabChange(v: string) {
    const t = v as ProblemTier
    setActiveTier(t)
    try {
      window.sessionStorage.setItem(storageKey, t)
    } catch {}
  }

  const totalProblems = subjectProblems.length
  const totalSolved = subjectProblems.filter((p) => completedProblemIds.has(p.id)).length

  return (
    <div className="bg-[#1e293b] rounded-xl p-4 sm:p-6 border border-[#334155]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-4">
        <h3 className="text-xl font-semibold text-white">{subject}</h3>
        <span className="text-xs text-slate-400">
          {totalSolved}/{totalProblems} solved overall
        </span>
      </div>

      <Tabs value={activeTier} onValueChange={onTabChange}>
        <TabsList className="grid grid-cols-4 w-full h-auto bg-[#0f172a] border border-[#334155] p-1 gap-1">
          {TIER_ORDER.map((t) => {
            const inTier = tierProblems.get(t) ?? []
            const solved = inTier.filter((p) => completedProblemIds.has(p.id)).length
            const isCapstone = t === "capstone"
            const base =
              "h-auto py-2 text-xs sm:text-sm transition-colors rounded-md data-[state=active]:shadow-sm"
            const colors = isCapstone
              ? "text-amber-300/70 hover:text-amber-200 data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-200 data-[state=active]:border-amber-500/40"
              : "text-slate-300 hover:text-white data-[state=active]:bg-[#334155] data-[state=active]:text-white"
            return (
              <TabsTrigger
                key={t}
                value={t}
                className={`${base} ${colors}`}
              >
                <span className="flex flex-col items-center gap-0.5">
                  <span className="font-medium">{TIER_LABELS[t]}</span>
                  <span className="text-[10px] opacity-70">
                    {solved}/{inTier.length}
                  </span>
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {TIER_ORDER.map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <TierGrid
              tier={t}
              problems={tierProblems.get(t) ?? []}
              completedProblemIds={completedProblemIds}
              startingSession={startingSession}
              onStart={onStart}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

interface TierGridProps {
  tier: ProblemTier
  problems: Problem[]
  completedProblemIds: Set<string>
  startingSession: boolean
  onStart: (opts: StartOpts) => void
}

function TierGrid({
  tier,
  problems,
  completedProblemIds,
  startingSession,
  onStart,
}: TierGridProps) {
  if (problems.length === 0) {
    return (
      <div className="text-slate-500 text-sm py-6 text-center">
        No problems in this tier yet.
      </div>
    )
  }

  const bySubtopic = new Map<string, Problem[]>()
  for (const p of problems) {
    const key = p.subtopic ?? "General"
    if (!bySubtopic.has(key)) bySubtopic.set(key, [])
    bySubtopic.get(key)!.push(p)
  }

  const subtopics = Array.from(bySubtopic.entries()).sort(([a], [b]) => a.localeCompare(b))

  const isCapstone = tier === "capstone"

  return (
    <>
      {isCapstone && (
        <div className="mb-3 text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
          15-minute multi-part problems. Each part must be verbally justified before the next unlocks. Solve these unassisted and the interview is no harder.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {subtopics.map(([subtopic, group]) => {
          const total = group.length
          const solved = group.filter((p) => completedProblemIds.has(p.id)).length
          const unattempted = total - solved
          const topicSet = Array.from(new Set(group.map((p) => p.topic)))
          return (
            <button
              key={subtopic}
              onClick={() =>
                onStart({
                  topics: topicSet,
                  subtopic,
                  tier,
                })
              }
              disabled={startingSession || total === 0}
              className={`text-left p-4 rounded-lg border transition-all ${
                isCapstone
                  ? "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60"
                  : "bg-[#0f172a] border-[#334155] hover:border-blue-500/50 hover:bg-[#0f172a]/80"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <div className="font-medium text-white">{subtopic}</div>
              <div className="flex items-center flex-wrap gap-2 mt-2 text-xs">
                <span className="text-slate-500">
                  {total} problem{total !== 1 ? "s" : ""}
                </span>
                {solved > 0 && <span className="text-emerald-500">{solved} solved</span>}
                {unattempted > 0 && (
                  <span className="text-blue-400/80">{unattempted} new</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}

interface NavalReactorSectionProps {
  problems: Problem[]
  completedProblemIds: Set<string>
  unlocked: boolean
  capstonesCompleted: number
  capstonesTotal: number
  startingSession: boolean
  onStart: (opts: StartOpts) => void
}

const NR_REVEAL_KEY = "nupoc_nr_revealed"

function NavalReactorSection({
  problems,
  completedProblemIds,
  unlocked,
  capstonesCompleted,
  capstonesTotal,
  startingSession,
  onStart,
}: NavalReactorSectionProps) {
  const nrProblems = useMemo(
    () => problems.filter((p) => p.tier === "naval_reactor"),
    [problems],
  )
  const [revealed, setRevealed] = useState(false)
  const gridRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.sessionStorage.getItem(NR_REVEAL_KEY)
    if (saved === "1") setRevealed(true)
  }, [])

  function reveal() {
    setRevealed(true)
    try {
      window.sessionStorage.setItem(NR_REVEAL_KEY, "1")
    } catch {}
    setTimeout(() => {
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 50)
  }

  if (!unlocked) {
    return (
      <div
        id="naval-reactor"
        className="mb-10 rounded-lg border border-slate-700 bg-slate-800/40 p-5"
      >
        <div className="text-slate-300 font-semibold text-sm mb-1">
          🔒 Naval Reactor Bonus — locked
        </div>
        <p className="text-slate-400 text-xs leading-relaxed">
          Finish all {capstonesTotal || 6} capstones ({capstonesCompleted}/{capstonesTotal || 6} so far) to unlock. These are post-capstone stretch problems; completing them is not required for interview success.
        </p>
      </div>
    )
  }

  const bySubtopic = new Map<string, Problem[]>()
  for (const p of nrProblems) {
    const key = p.subtopic ?? "Naval Reactor"
    if (!bySubtopic.has(key)) bySubtopic.set(key, [])
    bySubtopic.get(key)!.push(p)
  }
  const subtopics = Array.from(bySubtopic.entries()).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div id="naval-reactor" className="mb-10">
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-5">
        <div className="text-red-300 font-semibold text-base mb-2">
          ⚠ Naval Reactor Bonus — extremely difficult, not recommended for most applicants
        </div>
        <p className="text-slate-300 text-sm leading-relaxed mb-2">
          These post-capstone problems test submarine-specific scenarios — heat transfer in the reactor cooling loop, emergency-blow dynamics, electrical fault response, reactor point kinetics. They are <span className="text-red-300 font-medium">harder than anything you will see in your actual NUPOC interview</span>.
        </p>
        <p className="text-slate-300 text-sm leading-relaxed mb-3">
          You have already done the work that maximizes your interview pass rate. Only attempt these if you&apos;ve cleared every capstone and want extra stretch. <span className="text-slate-400">Skipping this section does not hurt your chances.</span>
        </p>
        {!revealed && (
          <button
            onClick={reveal}
            className="inline-flex items-center px-3 py-1.5 text-xs rounded border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors"
          >
            Reveal Naval Reactor problems
          </button>
        )}
      </div>

      {revealed && (
        <div ref={gridRef} className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subtopics.map(([subtopic, group]) => {
            const total = group.length
            const solved = group.filter((p) => completedProblemIds.has(p.id)).length
            const unattempted = total - solved
            const topicSet = Array.from(new Set(group.map((p) => p.topic)))
            return (
              <button
                key={subtopic}
                onClick={() =>
                  onStart({
                    topics: topicSet,
                    subtopic,
                    tier: "naval_reactor",
                  })
                }
                disabled={startingSession || total === 0}
                className="text-left p-4 rounded-lg border border-red-500/30 bg-red-500/5 hover:border-red-500/60 hover:bg-red-500/10 transition-all disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="font-medium text-white">{subtopic}</div>
                <div className="flex items-center flex-wrap gap-2 mt-2 text-xs">
                  <span className="text-slate-500">
                    {total} problem{total !== 1 ? "s" : ""}
                  </span>
                  {solved > 0 && <span className="text-emerald-500">{solved} solved</span>}
                  {unattempted > 0 && (
                    <span className="text-red-400/80">{unattempted} new</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function firstIncompleteTier(problems: Problem[], completedIds: Set<string>): ProblemTier {
  for (const t of TIER_ORDER) {
    const inTier = problems.filter((p) => p.tier === t)
    if (inTier.length === 0) continue
    if (inTier.some((p) => !completedIds.has(p.id))) return t
  }
  return "basic"
}
