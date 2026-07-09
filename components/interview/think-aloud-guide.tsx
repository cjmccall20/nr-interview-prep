"use client"

import { useState } from "react"
import { Mic } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface Section {
  title: string
  body: string
  examples?: string[]
}

// Boardsmanship / think-aloud technique for oral technical interviews. The
// interviewer can only evaluate (and help with) reasoning they can hear.
const SECTIONS: Section[] = [
  {
    title: "Why narrate at all",
    body: "The interviewer grades your PROCESS, not just your answer — and they can't read your mind. Silent thinking is invisible: they can't tell whether you're methodically checking units or completely lost, and silence usually reads as lost. Reasoning you say out loud earns credit and invites help; reasoning you keep in your head earns nothing.",
  },
  {
    title: "Phrases that work",
    body: "You don't need to talk constantly — you need to signal what you're doing. A few stock phrases cover almost every moment:",
    examples: [
      "\"I'm going to pause and write this out, then explain it.\"",
      "\"Here's what I know so far… and here's the part I'm unsure about.\"",
      "\"Let me state my assumptions before I start.\"",
      "\"I'm stuck on X — here's what I'd try first.\"",
      "\"Sanity check before I continue: the units work out.\"",
    ],
  },
  {
    title: "When you're stuck",
    body: "Never go dark. Say what you DO know, name the specific blocker, and propose an approach out loud — even a wrong one. \"I know energy is conserved, but I'm not sure how the spring term enters — let me try writing the total energy at both states\" shows an interviewer exactly where you are and how you attack a wall. That IS the skill being tested.",
  },
  {
    title: "Rhythm",
    body: "It's fine to pause and write — real candidates do it constantly. Just announce the pause (\"give me a moment to work this integral, then I'll walk you through it\") and keep it short. Aim to never be silent for more than about 45 seconds.",
  },
  {
    title: "In this app",
    body: "Turn the mic on and leave it on for the whole session. Your speech is captured with timestamps, and the interviewer gives you specific feedback on your think-aloud — including calling out long silences — exactly like a real board would experience you.",
  },
]

export default function ThinkAloudGuide({
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  showTrigger?: boolean
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  return (
    <>
      {showTrigger && (
        <button
          onClick={() => setOpen(true)}
          className="px-2 sm:px-3 py-1.5 text-xs font-medium text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/10 transition-colors flex items-center gap-1.5"
          title="How to think aloud like a real interview"
        >
          <Mic className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Think-Aloud Guide</span>
          <span className="sm:hidden">Aloud</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0f172a] border-[#334155] text-slate-200 sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              Think Aloud — Boardsmanship for Oral Interviews
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              The real interview is a conversation at a whiteboard. Interviewers
              can only grade — and help with — the reasoning they can hear.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-4 mt-2">
            {SECTIONS.map((section, i) => (
              <li key={section.title} className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-amber-600/20 border border-amber-500/40 text-amber-300 text-sm font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-white text-sm font-semibold mb-0.5">
                    {section.title}
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {section.body}
                  </p>
                  {section.examples && (
                    <ul className="mt-2 space-y-1 border-l-2 border-[#334155] pl-3">
                      {section.examples.map((ex, j) => (
                        <li key={j} className="text-slate-400 text-[13px] leading-snug">
                          {ex}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}
