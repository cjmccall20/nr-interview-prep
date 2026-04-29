import { type NextRequest } from "next/server"
import OpenAI from "openai"
import {
  CAPSTONE_PROMPT,
  TTFP_PROMPT,
  DERIVATION_PROMPT,
  REVIEW_PROMPT,
} from "@/lib/interview/ai-prompts"
import {
  compressWhiteboardImage,
  isBlankImage,
} from "@/lib/interview/image-compress"
import { getOpenAIKey } from "@/lib/interview/openai-key"

export const maxDuration = 60
export const runtime = "nodejs"

interface ProblemPart {
  label: string
  prompt: string
  solution_outline?: string
  expected_summary?: string
}

interface EvaluateBody {
  session_id?: string
  phase?: "ttfp" | "derivation" | "review"
  text_response?: string
  whiteboard_image?: string
  conversation_history?: { role: string; content: string }[]
  problem_context?: {
    prompt_text?: string
    first_principle_target?: string
    solution_outline?: string
    parts_json?: ProblemPart[]
    current_part_index?: number
    part_summaries?: { label: string; summary: string }[]
  }
}

/**
 * POST /api/interview/evaluate
 *
 * Stateless Socratic AI evaluator. No auth, no DB.
 * The client is the source of truth for session state; it passes the full
 * problem_context and recent conversation_history on every call. We just
 * forward to OpenAI and stream the response back as SSE.
 */
export async function POST(request: NextRequest) {
  try {
    const apiKey = await getOpenAIKey()
    if (!apiKey) {
      return jsonError(
        500,
        "Server is missing OPENAI_API_KEY. Set it in your deployment env.",
      )
    }

    const body = (await request.json()) as EvaluateBody
    const {
      phase,
      text_response,
      whiteboard_image,
      conversation_history,
      problem_context,
    } = body

    if (!phase || (!text_response && !whiteboard_image)) {
      return jsonError(
        400,
        "phase and text_response or whiteboard_image are required",
      )
    }
    if (!problem_context?.prompt_text) {
      return jsonError(400, "problem_context with prompt_text is required")
    }

    const isCapstone =
      phase === "derivation" &&
      Array.isArray(problem_context.parts_json) &&
      problem_context.parts_json.length > 0

    let systemPrompt: string
    switch (phase) {
      case "ttfp":
        systemPrompt = TTFP_PROMPT
        break
      case "derivation":
        systemPrompt = isCapstone ? CAPSTONE_PROMPT : DERIVATION_PROMPT
        break
      case "review":
        systemPrompt = REVIEW_PROMPT
        break
      default:
        return jsonError(400, "Invalid phase")
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Problem: ${problem_context.prompt_text}\nTarget First Principle: ${problem_context.first_principle_target}${
          problem_context.solution_outline
            ? `\nSolution Reference (for your evaluation only, never reveal): ${problem_context.solution_outline}`
            : ""
        }`,
      },
    ]

    if (isCapstone && problem_context.parts_json) {
      const idx = problem_context.current_part_index ?? 0
      const parts = problem_context.parts_json
      const currentPart = parts[idx]
      const priorSummaries = problem_context.part_summaries ?? []
      const priorBlock =
        priorSummaries.length > 0
          ? priorSummaries.map((p) => `  ${p.label}: ${p.summary}`).join("\n")
          : "  (none yet)"
      messages.push({
        role: "system",
        content: `Capstone multi-part mode.
Total parts: ${parts.length}
Current part index: ${idx} (${currentPart?.label ?? "?"})
Current part prompt: ${currentPart?.prompt ?? ""}
Current part expected summary (reference only, never reveal): ${currentPart?.expected_summary ?? "n/a"}
Prior accepted parts (candidate may use these as given):
${priorBlock}

Focus evaluation on the CURRENT part only. If the candidate is clearly correct on the current part AND has verbally justified the governing constraint, emit [PART_COMPLETE: summary="<short result>"] on its own line. After the LAST part (${parts.length - 1}), use [PHASE_COMPLETE] instead.`,
      })
    }

    if (Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-6)) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({
            role: msg.role,
            content: msg.content,
          } as OpenAI.Chat.ChatCompletionMessageParam)
        }
      }
    }

    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
      {
        type: "text",
        text: text_response
          ? `Candidate's response:\n${text_response}`
          : "Candidate submitted their whiteboard work for review.",
      },
    ]

    if (whiteboard_image && (phase === "derivation" || phase === "review")) {
      const blank = await isBlankImage(whiteboard_image)
      if (blank) {
        userContent.push({
          type: "text",
          text: "[Note: The candidate's whiteboard appears to be blank or nearly empty.]",
        })
      } else {
        const compressed = await compressWhiteboardImage(whiteboard_image)
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${compressed}`,
            detail: "low",
          },
        })
      }
    }

    messages.push({ role: "user", content: userContent })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const completion = await new OpenAI({ apiKey, fetch: globalThis.fetch.bind(globalThis) }).chat.completions.create({
            model: "gpt-4o",
            messages,
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: 1000,
            temperature: 0.7,
          })

          let fullResponse = ""

          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || ""
            if (content) {
              fullResponse += content
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`),
              )
            }
          }

          const phaseComplete =
            fullResponse.includes("[PHASE_COMPLETE]") ||
            /\[PART_COMPLETE:\s*summary\s*=/i.test(fullResponse)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                phase_complete: phaseComplete,
                full_response: fullResponse,
              })}\n\n`,
            ),
          )
          controller.close()
        } catch (err) {
          const detail =
            err instanceof Error
              ? `${err.name}: ${err.message}${err.cause ? ` | cause: ${String(err.cause)}` : ""}${err.stack ? `\n${err.stack}` : ""}`
              : String(err)
          console.error("OpenAI evaluation error:", detail)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: "AI evaluation failed. Please try again.",
                done: true,
              })}\n\n`,
            ),
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("Evaluate route error:", error)
    return jsonError(500, "Internal server error")
  }
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
