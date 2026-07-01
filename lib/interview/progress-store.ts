/**
 * Long-term, per-topic weakness tracking — persisted in localStorage and
 * DELIBERATELY separate from session state so it survives "Clear all progress".
 *
 * Two signals are combined (hybrid):
 *  - Derived baseline: attempts / completions / hints / TTFP already captured per
 *    completed session. High hint-rate or low flawless-rate ⇒ weaker topic.
 *  - AI concept-tags: the grader emits [WEAKNESS: concept="…"] only when a real
 *    misconception surfaced; we accumulate counts per concept.
 */

const STORAGE_KEY = "nr_topic_progress_v1"

export interface TopicProgress {
  topic: string
  attempts: number
  completions: number
  flawless: number
  totalHints: number
  ttfpSamples: number
  ttfpTotalSeconds: number
  /** concept phrase -> times seen */
  concepts: Record<string, number>
  lastUpdated: string
}

export interface OutcomeInput {
  topic: string
  hints: number
  flawless: boolean
  ttfpSeconds?: number | null
  concepts?: string[]
}

function readAll(): Record<string, TopicProgress> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, TopicProgress>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, TopicProgress>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error("Failed to persist topic progress:", e)
  }
}

/** Record a completed problem's outcome into the per-topic long-term store. */
export function recordOutcome(outcome: OutcomeInput): void {
  if (typeof window === "undefined") return
  const all = readAll()
  const now = new Date().toISOString()
  const existing: TopicProgress = all[outcome.topic] ?? {
    topic: outcome.topic,
    attempts: 0,
    completions: 0,
    flawless: 0,
    totalHints: 0,
    ttfpSamples: 0,
    ttfpTotalSeconds: 0,
    concepts: {},
    lastUpdated: now,
  }

  existing.attempts += 1
  existing.completions += 1
  if (outcome.flawless) existing.flawless += 1
  existing.totalHints += outcome.hints
  if (typeof outcome.ttfpSeconds === "number") {
    existing.ttfpSamples += 1
    existing.ttfpTotalSeconds += outcome.ttfpSeconds
  }
  for (const c of outcome.concepts ?? []) {
    const key = c.trim()
    if (!key) continue
    existing.concepts[key] = (existing.concepts[key] ?? 0) + 1
  }
  existing.lastUpdated = now

  all[outcome.topic] = existing
  writeAll(all)
}

export interface WeaknessRow extends TopicProgress {
  /** 0..1, higher = weaker. Blends hint-rate and non-flawless-rate. */
  weaknessScore: number
  topConcepts: { concept: string; count: number }[]
}

/**
 * Ranked weakest topics for the dashboard "Areas to Review" panel. A topic is
 * weaker when it needed more hints per problem and produced fewer flawless runs.
 * Topics with concept-tags are surfaced even if their derived score is modest.
 */
export function getWeaknessRanking(): WeaknessRow[] {
  const rows = Object.values(readAll())
  return rows
    .map((r): WeaknessRow => {
      const nonFlawlessRate =
        r.completions > 0 ? 1 - r.flawless / r.completions : 0
      // Normalize hint pressure: 3 hints on a problem is the max, so cap the rate.
      const hintRate =
        r.completions > 0 ? Math.min(1, r.totalHints / (r.completions * 3)) : 0
      const conceptPressure = Object.keys(r.concepts).length > 0 ? 0.15 : 0
      const weaknessScore = Math.min(
        1,
        0.55 * nonFlawlessRate + 0.3 * hintRate + conceptPressure,
      )
      const topConcepts = Object.entries(r.concepts)
        .map(([concept, count]) => ({ concept, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      return { ...r, weaknessScore, topConcepts }
    })
    .sort((a, b) => b.weaknessScore - a.weaknessScore)
}

/** Explicit opt-in reset (NOT triggered by "Clear all progress"). */
export function resetWeaknessHistory(): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.error("Failed to reset weakness history:", e)
  }
}
