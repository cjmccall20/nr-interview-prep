# NR Interview Prep

A standalone, open-source **Naval Reactors (NUPOC) interview simulator**. It puts
candidates in front of a Socratic AI tutor that grades them the way an actual
NR technical interviewer does: identify the first principle, derive the result,
then narrate what you did.

No database. No logins. No backend service to stand up. Clone the repo, drop
in an OpenAI API key, and run it.

- Next.js 15 (App Router) + React 19 + Tailwind 4
- OpenAI `gpt-4o` for evaluation (with vision) and Tier-3 hints
- Client-only session persistence via `localStorage`
- ~215 vetted problems across Calculus, Physics, and major-specific topics
- Optional "Teach Me" equation sheet + study guide for every NUPOC topic

## Quick Start

```bash
# 1. Clone + install
git clone <this-repo>.git
cd nr-interview-prep
npm install

# 2. Add your OpenAI key
cp .env.example .env.local
# edit .env.local and set OPENAI_API_KEY=sk-...

# 3. Run
npm run dev
# → http://localhost:3000
```

### Deploy to Vercel

1. Push this repo to GitHub.
2. Import the repo into Vercel — accept the defaults (it's a standard Next.js app).
3. In **Project Settings → Environment Variables**, add `OPENAI_API_KEY`.
4. Deploy.

That's it. No database provisioning, no auth setup, no migrations.

## What the Candidate Sees

### 1. Dashboard (`/interview`)
Five tiers of problems, worked in order:

| Tier | Purpose |
|---|---|
| **Basic** | Sanity checks on fundamentals (can you set up `F=ma`?) |
| **Intermediate** | Standard NUPOC interview difficulty |
| **Difficult** | Stretch problems |
| **Capstone** | Multi-part, 15-minute, verbally-gated problems. Finish these unassisted and you're interview-ready. |
| **Naval Reactor** | Unlocked after all capstones. Submarine-specific: reactor kinetics, emergency blow, electrical fault. Harder than the real interview — optional. |

Problems are further split into **Core** (Calculus + Physics, tested for every
major) and **Major-Specific** topic grids (EE, ChemE, MechE, NukeE, CS, Math,
Chemistry, Circuits).

### 2. Session Workspace (`/interview/session/[id]`)
A single-problem workspace with three phases:

1. **TTFP — Time to First Principle** (60 seconds). The candidate types the
   governing law. The whiteboard is locked. The tutor will not advance until
   the principle is correct.
2. **Derivation** (problem-specific timer, usually 5 min; 15 min for capstones).
   Whiteboard unlocks. The candidate draws/writes the derivation, narrates in
   text, and submits the whiteboard image for GPT-4o Vision grading.
3. **Complete**. Flawless-execution flag if no hints were used.

**Capstones** skip TTFP and chain parts: each part must be verbally justified
before the next unlocks. The grader emits `[PART_COMPLETE: summary="..."]`
markers that the client uses to carry the result forward as a given.

**Hints** come in three tiers, escalating:
- **Tier 1**: canned Socratic nudge (offline — no API call)
- **Tier 2**: canned framework for the target first principle (offline)
- **Tier 3**: GPT-4o generates the anchor equation

Using any hint disqualifies the problem from "flawless execution."

### 3. Teach Me (`/interview/teach`)
A static study guide. Every NUPOC topic gets a short equation sheet plus
context, worked examples, and (for a handful) SVG diagrams — unit circle,
FBD inclined plane, frustum slant. No AI calls; this is pure reference.

### Responsive Layout
Both the session workspace and study guide adapt below `md` (768px):
- **Session**: chat and whiteboard collapse into a bottom tab switcher.
  The fun fact becomes a full-panel overlay during evaluation, and the
  view auto-flips to the whiteboard after TTFP completes.
- **Teach Me**: the topic sidebar becomes a slide-out drawer triggered by
  a "Topics" button.
- **Dashboard**: the stats grid stacks to a single column.

Desktop layout (the `ResizablePanelGroup` split) is unchanged at ≥ `md`.

## Repository Layout

```
nr-interview-prep/
├── app/
│   ├── api/interview/
│   │   ├── evaluate/route.ts      # POST: SSE streaming Socratic grader (gpt-4o)
│   │   └── hint/route.ts          # POST: Tier 1/2 canned, Tier 3 via gpt-4o
│   ├── interview/
│   │   ├── page.tsx               # dashboard
│   │   ├── session/[id]/          # single-problem workspace
│   │   ├── teach/page.tsx         # study guide
│   │   └── layout.tsx
│   ├── globals.css                # Tailwind 4 entry + design tokens
│   ├── layout.tsx                 # root layout, font + KaTeX CSS
│   └── page.tsx                   # redirects / → /interview
│
├── components/
│   ├── interview/
│   │   ├── interview-dashboard.tsx    # tier tabs, topic grids, progress
│   │   ├── session-workspace.tsx      # phase state machine, SSE consumer
│   │   ├── whiteboard.tsx             # canvas + export to PNG
│   │   ├── chat-log.tsx               # tutor ↔ candidate transcript
│   │   ├── markdown-with-math.tsx     # react-markdown + KaTeX
│   │   ├── phase-timer.tsx            # countdown timer
│   │   ├── fun-fact.tsx               # idle-while-grading distraction
│   │   ├── teach-guide.tsx            # renders /interview/teach
│   │   └── teach-diagrams/            # inline SVGs
│   ├── ui/                            # shadcn primitives (tabs, dialog, ...)
│   └── theme-provider.tsx
│
├── lib/interview/
│   ├── ai-prompts.ts              # system prompts for TTFP / Derivation / Review / Capstone / Hint
│   ├── problems.ts                # static problem bank (~140 problems)
│   ├── session-store.ts           # localStorage CRUD for sessions
│   ├── stream.ts                  # SSE client for /api/interview/evaluate
│   ├── image-compress.ts          # sharp pipeline for whiteboard PNGs
│   ├── teach-content.ts           # study-guide content
│   ├── fun-facts.ts               # idle messages
│   └── types.ts                   # shared TS types
│
├── .env.example                   # OPENAI_API_KEY only
├── LICENSE                        # MIT
├── next.config.mjs                # CSP + security headers
├── package.json
├── postcss.config.mjs             # Tailwind 4 PostCSS plugin
├── tsconfig.json
└── README.md                      # you are here
```

## Architecture Notes

### Stateless API routes
Both `/api/interview/evaluate` and `/api/interview/hint` are **stateless** — the
client passes the full problem context and the last 6 messages of conversation
history on every call. The server holds no session state, so there's no
database, no cache, no auth.

This is a deliberate choice: the whole app is trivially shippable as a static
Vercel deploy plus two serverless functions.

### Client-only persistence
Sessions (progress, hint counts, capstone part summaries) live in the
candidate's browser `localStorage` under the key `nr_interview_sessions_v1`.
Clearing site data wipes progress. That's the intended tradeoff.

The `lib/interview/session-store.ts` module exposes a tiny CRUD API:
`listSessions`, `getSession`, `createSession(opts)`, `updateSession(id, fields)`,
`deleteSession(id)`, plus a `pickProblem(filter)` helper that selects from the
static bank.

### Prompt injection mitigation
Candidate-supplied text (problem prompts, whiteboard transcripts) is wrapped
in `<problem>` and `<target>` XML-style tags, and a system message instructs
the model to treat the tag contents as data. Inputs are also length-capped.

### Whiteboard pipeline
The canvas exports PNG → base64 → server-side `sharp` pipeline:
1. Reject if the image is blank/near-blank (`isBlankImage`).
2. Compress to grayscale JPEG, max dimension 1024px (`compressWhiteboardImage`).
3. Send to GPT-4o Vision with `detail: "low"`.

This keeps token cost predictable.

## Dependencies

| Package | Why it's here |
|---|---|
| `next` / `react` / `react-dom` | Framework |
| `openai` | Chat Completions API client (evaluate + hint) |
| `sharp` | Server-side whiteboard PNG compression |
| `react-markdown` + `remark-math` + `rehype-katex` + `katex` | Render tutor responses + problem prompts with LaTeX math |
| `react-resizable-panels` | Split-pane layout in the session workspace |
| `@radix-ui/react-*` | Accessible primitives for tabs, dialog, select, etc. (shadcn/ui style) |
| `lucide-react` | Icons |
| `class-variance-authority` + `clsx` + `tailwind-merge` | Tailwind class composition for shadcn-style components |
| `tailwindcss` v4 + `@tailwindcss/postcss` + `tw-animate-css` | Styling |

No database driver, no auth SDK, no email/SMS provider. Just OpenAI + Next.js.

## Customizing

### Add or edit problems
Edit `lib/interview/problems.ts`. Each entry is a plain object of type
`Problem` (see `lib/interview/types.ts`). Problem IDs are stable strings like
`"p-0001"` — keep them stable across edits so in-flight sessions keep resolving.

Fields worth knowing:
- `tier`: `"basic" | "intermediate" | "difficult" | "capstone" | "naval_reactor"`
- `parts_json`: set this for capstones — an array of `{label, prompt, expected_summary}` objects
- `time_limit_seconds`: overrides the default 5-minute derivation timer
- `first_principle_target`: the governing law. Used as the Tier-2 hint anchor
  and fed to the grader so it knows what to accept as a correct TTFP

### Tune the tutor voice
All system prompts live in `lib/interview/ai-prompts.ts`:
`TTFP_PROMPT`, `DERIVATION_PROMPT`, `CAPSTONE_PROMPT`, `REVIEW_PROMPT`,
`HINT_TIER_3_PROMPT`, plus canned `TIER_1_NUDGES` and `TIER_2_FRAMEWORKS`.

### Swap the AI provider
The only file that imports `openai` is `app/api/interview/*/route.ts`. Point
it at any OpenAI-compatible endpoint (Azure OpenAI, Together, LiteLLM, etc.)
by changing the `OpenAI` client's `baseURL` and `apiKey`. Update the model
name (`gpt-4o`) to taste.

For vision-based whiteboard grading you need a **multimodal** model — the
current plumbing assumes OpenAI's Chat Completions image content format.

### Disable whiteboard / vision
If you want a text-only variant (cheaper, no vision spend), strip the
`whiteboard_image` handling in `app/api/interview/evaluate/route.ts` and
remove the `<Whiteboard>` component from `session-workspace.tsx`.

## Security

- `OPENAI_API_KEY` is **server-only** — never exposed to the browser.
- CSP locks `connect-src` to `'self'`; the client can only talk to our own
  API routes, which then talk to OpenAI server-side.
- Candidate inputs to the AI are tag-delimited and length-capped to reduce
  prompt-injection blast radius.
- No PII is collected or persisted server-side. Sessions are local to the
  browser.

## License

MIT — see [LICENSE](./LICENSE).

Contributions and problem-bank expansions are welcome. If you add a new
topic or tier, update the dashboard grids (`MAJOR_SPECIFIC_GROUPS` /
`SUBJECT_TOPICS` in `components/interview/interview-dashboard.tsx`) so the
new problems surface in the UI.
