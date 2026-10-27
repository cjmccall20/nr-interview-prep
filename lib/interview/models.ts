/**
 * OpenAI models for each call. Terra handles every evaluate phase; Luna writes
 * the tier-3 hint. Luna also passed the whiteboard cases in testing, but it
 * skipped [PHASE_COMPLETE] on about 1 in 5 correct TTFP answers.
 */
export const GRADING_MODEL = "gpt-6.1-terra"
export const LIGHT_MODEL = "gpt-6-luna"

/**
 * Reasoning "none" keeps these models closest to gpt-4o: no hidden reasoning
 * tokens, fastest first token. openai@4 types predate "none", so it is spread
 * into the request as an untyped extra param.
 */
export const NO_REASONING = { reasoning_effort: "none" } as object
