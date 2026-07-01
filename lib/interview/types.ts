export type MajorCategory = 'all' | 'ee' | 'cheme' | 'mech' | 'nuke' | 'cs' | 'math'

export type ProblemTier = 'basic' | 'intermediate' | 'difficult' | 'capstone' | 'naval_reactor'

export interface ProblemPart {
  label: string
  prompt: string
  solution_outline?: string
  expected_summary?: string
}

export interface Problem {
  id: string
  topic: string
  subtopic: string | null
  difficulty: number
  prompt_text: string
  first_principle_target: string
  solution_outline: string | null
  major_category: MajorCategory
  requires_diagram: boolean
  created_at: string
  time_limit_seconds: number | null
  parts_json: ProblemPart[] | null
  tier: ProblemTier
  /**
   * Full Chegg-style worked solution (Markdown + KaTeX), authored up front by a
   * higher-tier model. Revealed to the candidate only after they attempt the
   * problem; also passed to the grader as an evaluation-only answer key.
   */
  solution_walkthrough?: string
  /**
   * Ordered list of "are you sure?" follow-ups that challenge a core simplifying
   * assumption (e.g. "now assume air drag"). Authored only for problems where an
   * assumption materially changes the answer; absent/empty for procedural problems.
   */
  assumption_challenges?: string[]
}

export type SessionPhase = 'ttfp' | 'derivation' | 'review' | 'complete'

export interface PartSummary {
  label: string
  summary: string
}

export interface Session {
  id: string
  problem_id: string
  phase: SessionPhase
  started_at: string
  completed_at: string | null
  ttfp_seconds: number | null
  flawless_execution: boolean
  total_hints: number
  created_at: string
  current_part_index: number | null
  part_summaries: PartSummary[] | null
}
