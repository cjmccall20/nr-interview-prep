"use client"

import { useState } from "react"
import { Compass } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface Step {
  title: string
  body: string
  examples?: string[]
}

// Section 2 of the NUPOC Technical Interview Preparation Guide — the structured
// approach candidates should apply to every technical problem.
const STEPS: Step[] = [
  {
    title: "Identify the Problem Type",
    body: "Before touching any math, name what kind of problem you're facing. This focuses your thinking and signals to the interviewer that you understand the underlying physics or mathematics.",
    examples: [
      "\"This is a conservation of energy problem.\"",
      "\"This is a related rates problem using implicit differentiation.\"",
      "\"This requires integration by parts.\"",
    ],
  },
  {
    title: "State Governing Principles and Equations",
    body: "Explicitly state the fundamental principle or equation that applies. This shows you understand the physics, not just the procedure.",
    examples: [
      "\"Conservation of energy: KE(initial) + PE(initial) = KE(final) + PE(final)\"",
      "\"For related rates, I'll use the chain rule: dy/dt = (dy/dx)(dx/dt)\"",
      "\"Integration by parts: ∫u dv = uv − ∫v du\"",
    ],
  },
  {
    title: "State Simplifying Assumptions",
    body: "These are modeling choices that make the problem tractable. State them explicitly so the interviewer knows you're aware of the idealizations you're making.",
    examples: [
      "\"I'll assume no air resistance.\"",
      "\"I'll model the Earth as a perfect sphere.\"",
      "\"I'll treat the collision as perfectly elastic.\"",
    ],
  },
  {
    title: "Identify Missing Information",
    body: "When data is needed but not provided, you have three valid options — just be explicit about which you're taking: ask for it, assume a reasonable value, or use a variable and solve symbolically. Expect pushback (\"give me your best estimate\") — a reasonable guess in the right order of magnitude beats refusing to commit.",
    examples: [
      "Ask for it: \"What is the initial velocity?\"",
      "Assume a reasonable value: \"I'll estimate the radius of Earth as 6000 km.\"",
      "Use a variable: \"I don't know the height, so I'll call it h and solve symbolically.\"",
    ],
  },
  {
    title: "Execute Methodically",
    body: "Work through the problem step by step. Narrate your reasoning out loud (or in writing). Track your units throughout — this catches errors and demonstrates rigor.",
  },
  {
    title: "Sanity Check",
    body: "Before declaring your answer, verify it makes sense.",
    examples: [
      "Does the answer have correct units?",
      "Is the magnitude reasonable?",
      "Does it match your physical intuition?",
      "What happens at limiting cases (mass → 0, angle → 90°)?",
    ],
  },
]

export default function MethodologyGuide() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-2 sm:px-3 py-1.5 text-xs font-medium text-blue-300 border border-blue-500/40 rounded hover:bg-blue-500/10 transition-colors flex items-center gap-1.5"
        title="How to approach any technical problem"
      >
        <Compass className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Problem-Solving Methodology</span>
        <span className="sm:hidden">Method</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0f172a] border-[#334155] text-slate-200 sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              Recommended Problem-Solving Methodology
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Apply this same structured approach to every problem — kinematics,
              integration, or a Fermi estimate. It demonstrates clear thinking and
              keeps you organized under pressure.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-4 mt-2">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 text-sm font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-white text-sm font-semibold mb-0.5">
                    {step.title}
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {step.body}
                  </p>
                  {step.examples && (
                    <ul className="mt-2 space-y-1 border-l-2 border-[#334155] pl-3">
                      {step.examples.map((ex, j) => (
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
