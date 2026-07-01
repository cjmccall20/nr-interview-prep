/**
 * Shared error helpers for the interview API routes.
 *
 * When the OpenAI account runs out of credits (or the key is revoked), we want
 * candidates to see a friendly "contact Cooper" message instead of a raw error.
 */

export const CREDITS_ERROR_CODE = "CREDITS_EXHAUSTED"

export const CREDITS_MESSAGE =
  "The AI grader is temporarily out of API credits. Please contact Cooper at cooper.j.mccall.mil@us.navy.mil to have it restored."

/**
 * True when an OpenAI error indicates the account is out of credits or the key
 * is invalid/removed — i.e. a billing/auth problem the candidate can't fix and
 * that a retry won't resolve.
 */
export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as {
    status?: number
    code?: string
    type?: string
    error?: { code?: string; type?: string }
  }
  const status = e.status
  const code = e.code ?? e.error?.code
  const type = e.type ?? e.error?.type
  if (status === 401) return true // bad or removed key
  if (status === 429 && (code === "insufficient_quota" || type === "insufficient_quota")) {
    return true
  }
  return false
}
