// Pre-compressed by the browser in components/interview/whiteboard.tsx
// (1024px max, JPEG quality 0.7). Server-side image processing is a no-op
// so this module runs on Cloudflare Workers (no native binaries).

const BLANK_BASE64_THRESHOLD = 6000

export async function compressWhiteboardImage(base64Image: string): Promise<string> {
  return base64Image.replace(/^data:image\/\w+;base64,/, "")
}

export async function isBlankImage(base64Image: string): Promise<boolean> {
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "")
  return base64Data.length < BLANK_BASE64_THRESHOLD
}
