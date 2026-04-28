import { getCloudflareContext } from "@opennextjs/cloudflare"

export async function getOpenAIKey(): Promise<string | undefined> {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  try {
    const cf = await getCloudflareContext({ async: true })
    return (cf?.env as Record<string, string | undefined> | undefined)?.OPENAI_API_KEY
  } catch {
    return undefined
  }
}
