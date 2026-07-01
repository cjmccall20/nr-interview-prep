/**
 * Candidate-facing worked solutions + assumption challenges, keyed by problem id.
 *
 * Kept SEPARATE from the problem bank (problems.ts) so this large, generated
 * content can be authored/regenerated independently. `problems.ts` merges these
 * onto each Problem at module load. A missing entry simply means no walkthrough
 * is shown for that problem yet.
 *
 * `walkthrough` is Markdown + KaTeX (`$...$` / `$$...$$`), authored to the guide's
 * 6-step methodology: identify type → governing principle → assumptions → execute
 * → answer → sanity check + likely follow-ups.
 *
 * `challenges` are "are you sure?" follow-ups posed after a sound solution; author
 * them ONLY for problems where a simplifying assumption materially changes the
 * answer (physics-style). Leave undefined for procedural calculus/algebra problems.
 */

export interface ProblemSolution {
  walkthrough: string
  challenges?: string[]
}

export const SOLUTIONS: Record<string, ProblemSolution> = {}
