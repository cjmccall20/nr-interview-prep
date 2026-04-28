import { NextRequest, NextResponse } from "next/server"

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

function readEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && process.env?.[name]) {
    return process.env[name]
  }
  // Workers expose bindings on globalThis when bundled by OpenNext
  const g = globalThis as unknown as Record<string, string | undefined>
  return g[name]
}

export function middleware(request: NextRequest) {
  const expectedUser = readEnv("BASIC_AUTH_USER")
  const expectedPass = readEnv("BASIC_AUTH_PASS")

  if (!expectedUser || !expectedPass) {
    return new NextResponse(
      `Server misconfigured: basic auth credentials not set (user=${!!expectedUser}, pass=${!!expectedPass})`,
      { status: 500 },
    )
  }

  const header = request.headers.get("authorization")
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6))
      const sep = decoded.indexOf(":")
      if (sep !== -1) {
        const user = decoded.slice(0, sep)
        const pass = decoded.slice(sep + 1)
        if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPass)) {
          return NextResponse.next()
        }
      }
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="NUPOC Interview Prep", charset="UTF-8"',
    },
  })
}
