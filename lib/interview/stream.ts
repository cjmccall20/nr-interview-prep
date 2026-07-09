/**
 * SSE client for streaming AI responses via Next.js proxy routes.
 */

import type { PartSummary, ProblemPart } from "./types"

interface EvaluatePayload {
  session_id: string
  phase: string
  text_response: string
  whiteboard_image?: string
  /** Timestamped think-aloud transcript block (see lib/interview/transcript.ts). */
  verbal_transcript?: string
  mic_used?: boolean
  conversation_history?: { role: string; content: string }[]
  problem_context: {
    prompt_text: string
    first_principle_target: string
    solution_outline?: string
    solution_walkthrough?: string
    parts_json?: ProblemPart[]
    current_part_index?: number
    part_summaries?: PartSummary[]
    assumption_challenges?: string[]
    challenges_remaining?: number
  }
}

interface StreamCallbacks {
  onChunk: (content: string) => void
  onComplete: (fullResponse: string, phaseComplete: boolean) => void
  onError: (error: string) => void
}

export async function streamEvaluation(
  payload: EvaluatePayload,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  try {
    const response = await fetch("/api/interview/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
      callbacks.onError(errorData.error || `HTTP ${response.status}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError("No response stream available")
      return
    }

    const decoder = new TextDecoder()
    let buffer = ""
    let completed = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue

        try {
          const data = JSON.parse(line.slice(6))

          if (data.error) {
            callbacks.onError(data.error)
            return
          }

          if (data.done) {
            callbacks.onComplete(data.full_response || "", data.phase_complete || false)
            completed = true
            return
          }

          if (data.content) {
            callbacks.onChunk(data.content)
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    if (!completed && buffer.trim()) {
      const remaining = buffer.trim()
      if (remaining.startsWith("data: ")) {
        try {
          const data = JSON.parse(remaining.slice(6))
          if (data.error) {
            callbacks.onError(data.error)
            return
          }
          if (data.done) {
            callbacks.onComplete(data.full_response || "", data.phase_complete || false)
            completed = true
          }
        } catch {
          // Ignore
        }
      }
    }

    if (!completed) {
      callbacks.onError("Stream ended without completion signal")
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return
    }
    callbacks.onError(error instanceof Error ? error.message : "Connection failed")
  }
}

interface HintPayload {
  session_id: string
  hint_tier: number
  problem_context: {
    prompt_text: string
  }
  first_principle_target: string
}

export async function requestHint(
  payload: HintPayload,
): Promise<{ hint: string; tier: number }> {
  const response = await fetch("/api/interview/hint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(data.error || `HTTP ${response.status}`)
  }

  return response.json()
}
