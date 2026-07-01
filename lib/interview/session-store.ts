/**
 * Client-only session persistence backed by localStorage.
 *
 * The standalone build has no server-side database — sessions live entirely
 * in the candidate's browser. All reads/writes here are synchronous and
 * no-op on the server (localStorage is undefined during SSR).
 */

import { PROBLEMS } from "./problems"
import type { Problem, ProblemTier, Session, SessionPhase } from "./types"

const STORAGE_KEY = "nr_interview_sessions_v1"

function readAll(): Session[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Session[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(sessions: Session[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch (e) {
    console.error("Failed to persist sessions:", e)
  }
}

export function listSessions(): Session[] {
  return readAll().sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function getSession(id: string): Session | null {
  return readAll().find((s) => s.id === id) ?? null
}

export function deleteSession(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id))
}

export function updateSession(
  id: string,
  fields: Partial<Omit<Session, "id" | "problem_id" | "created_at">>,
): Session | null {
  const all = readAll()
  const idx = all.findIndex((s) => s.id === id)
  if (idx < 0) return null
  const updated = { ...all[idx], ...fields }
  all[idx] = updated
  writeAll(all)
  return updated
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function pickRandom<T>(xs: T[]): T | null {
  if (xs.length === 0) return null
  return xs[Math.floor(Math.random() * xs.length)]
}

interface StartOpts {
  topic?: string
  subtopic?: string
  tier?: ProblemTier
  topics?: string[]
}

/**
 * Select a problem from the static bank matching the provided filter,
 * preferring problems not yet solved in existing sessions.
 */
export function pickProblem(opts: StartOpts): Problem | null {
  const candidates = PROBLEMS.filter((p) => {
    if (opts.topic && p.topic !== opts.topic) return false
    if (opts.topics && opts.topics.length > 0 && !opts.topics.includes(p.topic)) return false
    if (opts.subtopic && p.subtopic !== opts.subtopic) return false
    if (opts.tier && p.tier !== opts.tier) return false
    return true
  })

  if (candidates.length === 0) return null

  // Prefer problems the candidate has not yet completed.
  const completedIds = new Set(
    readAll().filter((s) => s.phase === "complete").map((s) => s.problem_id),
  )
  const unseen = candidates.filter((p) => !completedIds.has(p.id))
  return pickRandom(unseen.length > 0 ? unseen : candidates)
}

export function createSession(opts: StartOpts): Session | null {
  const problem = pickProblem(opts)
  if (!problem) return null

  const isCapstone = !!(problem.parts_json && problem.parts_json.length > 0)
  const now = new Date().toISOString()
  const session: Session = {
    id: uuid(),
    problem_id: problem.id,
    phase: isCapstone ? "derivation" : "ttfp",
    started_at: now,
    completed_at: null,
    ttfp_seconds: null,
    flawless_execution: false,
    total_hints: 0,
    created_at: now,
    current_part_index: isCapstone ? 0 : null,
    part_summaries: isCapstone ? [] : null,
  }

  writeAll([session, ...readAll()])
  return session
}

export function getProblem(id: string): Problem | null {
  return PROBLEMS.find((p) => p.id === id) ?? null
}

/**
 * Create a fresh session for a SPECIFIC problem (used by "Retry"), bypassing the
 * random problem picker. Mirrors createSession's capstone initialization.
 */
export function createSessionForProblem(problemId: string): Session | null {
  const problem = getProblem(problemId)
  if (!problem) return null

  const isCapstone = !!(problem.parts_json && problem.parts_json.length > 0)
  const now = new Date().toISOString()
  const session: Session = {
    id: uuid(),
    problem_id: problem.id,
    phase: isCapstone ? "derivation" : "ttfp",
    started_at: now,
    completed_at: null,
    ttfp_seconds: null,
    flawless_execution: false,
    total_hints: 0,
    created_at: now,
    current_part_index: isCapstone ? 0 : null,
    part_summaries: isCapstone ? [] : null,
  }

  writeAll([session, ...readAll()])
  return session
}

/**
 * Wipe session/attempt state so every problem can be tried fresh. Deliberately
 * PRESERVES the long-term weakness store (progress-store) — accumulated
 * feedback-over-time must survive a "start over".
 */
export function clearAllProgress(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem("whiteboard_backup")
  } catch (e) {
    console.error("Failed to clear progress:", e)
  }
}

/**
 * Legacy helper — normalize any stored phase="review" sessions to "complete",
 * since the "review" phase has been folded into "complete".
 */
export function migrateLegacyPhases(): void {
  const all = readAll()
  let changed = false
  for (const s of all) {
    if ((s.phase as SessionPhase) === "review") {
      s.phase = "complete"
      if (!s.completed_at) s.completed_at = new Date().toISOString()
      changed = true
    }
  }
  if (changed) writeAll(all)
}
