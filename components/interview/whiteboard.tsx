"use client"

import { useRef, useState, useEffect, useCallback } from "react"

interface Stroke {
  points: { x: number; y: number }[]
  color: string
  size: number
}

interface TextItem {
  x: number
  y: number
  text: string
  color: string
  size: number
}

type Tool = "pen" | "eraser" | "text"
type UndoEntry = "stroke" | "text"

interface WhiteboardProps {
  onExport: (base64: string) => void
  disabled?: boolean
  disabledReason?: string
  /** Parent increments this counter to request a canvas clear (e.g., after a capstone part completes). */
  clearSignal?: number
  /**
   * localStorage key for the auto-backup. Keyed per problem/session so that
   * reopening the same question restores its board, while opening a different
   * question starts blank. Defaults to the legacy shared key.
   */
  storageKey?: string
}

const COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Blue", value: "#2563eb" },
  { name: "Red", value: "#dc2626" },
]
const PEN_SIZES = [2, 4, 8]
const TEXT_SIZE = 22
const TEXT_LINE_HEIGHT = 1.3

interface EditingState {
  index: number | null // null = new text box; otherwise editing an existing one
  x: number
  y: number
  value: string
  color: string
}

export default function Whiteboard({ onExport, disabled, disabledReason, clearSignal, storageKey }: WhiteboardProps) {
  const backupKey = storageKey ?? "whiteboard_backup"
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [texts, setTexts] = useState<TextItem[]>([])
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null)
  const [tool, setTool] = useState<Tool>("pen")
  const [color, setColor] = useState("#000000")
  const [penSize, setPenSize] = useState(4)
  const [editing, setEditing] = useState<EditingState | null>(null)
  // Mirror of `editing` used to make commitEditing idempotent: overlapping
  // events (textarea blur + a toolbar click) must not commit the same box twice.
  const editingRef = useRef<EditingState | null>(null)
  const openEditor = useCallback((next: EditingState) => {
    editingRef.current = next
    setEditing(next)
  }, [])

  // Latest values for the resize handler (which runs with stale closures).
  const strokesRef = useRef(strokes)
  const textsRef = useRef(texts)
  strokesRef.current = strokes
  textsRef.current = texts

  const drawText = useCallback(
    (ctx: CanvasRenderingContext2D, item: TextItem) => {
      ctx.fillStyle = item.color
      ctx.font = `${item.size}px ui-sans-serif, system-ui, sans-serif`
      ctx.textBaseline = "top"
      const lineHeight = item.size * TEXT_LINE_HEIGHT
      item.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, item.x, item.y + i * lineHeight)
      })
    },
    [],
  )

  const paint = useCallback(
    (strokeList: Stroke[], textList: TextItem[], skipTextIndex?: number | null) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const stroke of strokeList) {
        if (stroke.points.length < 2) continue
        ctx.beginPath()
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.size
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
        }
        ctx.stroke()
      }

      textList.forEach((item, i) => {
        if (skipTextIndex != null && i === skipTextIndex) return // hidden while editing
        drawText(ctx, item)
      })
    },
    [drawText],
  )

  // Resize canvas to fill container.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resize = () => {
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      paint(strokesRef.current, textsRef.current)
    }

    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [paint])

  // LocalStorage backup every 10s.
  useEffect(() => {
    const interval = setInterval(() => {
      if (strokes.length > 0 || texts.length > 0) {
        localStorage.setItem(
          backupKey,
          JSON.stringify({ strokes, texts }),
        )
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [strokes, texts, backupKey])

  // Restore this question's board on mount (supports the legacy array-of-strokes format).
  useEffect(() => {
    const backup = localStorage.getItem(backupKey)
    if (backup) {
      try {
        const parsed = JSON.parse(backup)
        if (Array.isArray(parsed)) {
          setStrokes(parsed as Stroke[])
          setUndoStack((parsed as Stroke[]).map(() => "stroke"))
        } else {
          const s = (parsed.strokes ?? []) as Stroke[]
          const t = (parsed.texts ?? []) as TextItem[]
          setStrokes(s)
          setTexts(t)
          setUndoStack([...s.map(() => "stroke" as const), ...t.map(() => "text" as const)])
        }
      } catch {
        // Ignore corrupt backup
      }
    }
  }, [backupKey])

  // Re-render whenever content changes (hiding the box currently being edited).
  useEffect(() => {
    paint(strokes, texts, editing?.index ?? undefined)
  }, [strokes, texts, editing, paint])

  // Focus the overlay textarea when an edit session opens.
  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  function getPoint(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) {
      const touch = e.touches[0] ?? e.changedTouches[0]
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // Approximate hit-test for tapping an existing text box (to re-edit it).
  function findTextAt(x: number, y: number): number {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i]
      const lines = t.text.split("\n")
      const lineHeight = t.size * TEXT_LINE_HEIGHT
      const height = lines.length * lineHeight
      let width = 40
      if (ctx) {
        ctx.font = `${t.size}px ui-sans-serif, system-ui, sans-serif`
        width = Math.max(...lines.map((l) => ctx.measureText(l).width), 40)
      }
      if (x >= t.x - 4 && x <= t.x + width + 8 && y >= t.y - 4 && y <= t.y + height + 4) {
        return i
      }
    }
    return -1
  }

  function commitEditing() {
    const cur = editingRef.current
    editingRef.current = null // claim it immediately so a second call bails
    if (!cur) {
      setEditing(null)
      return
    }
    const value = cur.value.trim()
    if (cur.index == null) {
      if (value) {
        setTexts((prev) => [...prev, { x: cur.x, y: cur.y, text: value, color: cur.color, size: TEXT_SIZE }])
        setUndoStack((prev) => [...prev, "text"])
      }
    } else {
      const idx = cur.index
      setTexts((prev) => {
        const next = [...prev]
        if (value) next[idx] = { ...next[idx], text: value }
        else next.splice(idx, 1)
        return next
      })
    }
    setEditing(null)
  }

  function updateEditingValue(value: string) {
    setEditing((cur) => {
      if (!cur) return cur
      const next = { ...cur, value }
      editingRef.current = next
      return next
    })
  }

  function handleTextClick(e: React.MouseEvent | React.TouchEvent) {
    const p = getPoint(e)
    const hit = findTextAt(p.x, p.y)
    if (hit >= 0) {
      const t = texts[hit]
      openEditor({ index: hit, x: t.x, y: t.y, value: t.text, color: t.color })
    } else {
      openEditor({ index: null, x: p.x, y: p.y, value: "", color })
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (disabled) return
    if (tool === "text") {
      e.preventDefault()
      // If a box is still open (its blur hasn't committed yet), commit it and
      // wait for the next click to place a new one.
      if (editingRef.current) {
        commitEditing()
        return
      }
      handleTextClick(e)
      return
    }
    e.preventDefault()
    const point = getPoint(e)
    const stroke: Stroke = {
      points: [point],
      color: tool === "eraser" ? "#ffffff" : color,
      size: tool === "eraser" ? 20 : penSize,
    }
    setCurrentStroke(stroke)
    setIsDrawing(true)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !currentStroke || disabled || tool === "text") return
    e.preventDefault()
    const point = getPoint(e)
    const updated = {
      ...currentStroke,
      points: [...currentStroke.points, point],
    }
    setCurrentStroke(updated)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (ctx && currentStroke.points.length > 0) {
      const prev = currentStroke.points[currentStroke.points.length - 1]
      ctx.beginPath()
      ctx.strokeStyle = updated.color
      ctx.lineWidth = updated.size
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
    }
  }

  function endDraw() {
    if (!isDrawing || !currentStroke) return
    setStrokes((prev) => [...prev, currentStroke])
    setUndoStack((prev) => [...prev, "stroke"])
    setCurrentStroke(null)
    setIsDrawing(false)
  }

  function undo() {
    setUndoStack((prevStack) => {
      if (prevStack.length === 0) return prevStack
      const last = prevStack[prevStack.length - 1]
      if (last === "stroke") setStrokes((s) => s.slice(0, -1))
      else setTexts((t) => t.slice(0, -1))
      return prevStack.slice(0, -1)
    })
  }

  function clearCanvas() {
    setStrokes([])
    setTexts([])
    setUndoStack([])
    setEditing(null)
    localStorage.removeItem(backupKey)
  }

  // Clear when the parent bumps clearSignal (capstone part advance).
  useEffect(() => {
    if (clearSignal === undefined || clearSignal === 0) return
    setStrokes([])
    setTexts([])
    setUndoStack([])
    setEditing(null)
    localStorage.removeItem(backupKey)
  }, [clearSignal, backupKey])

  function exportCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return

    // Fold any in-progress text box into the export, and repaint the full canvas
    // (no hidden index) so what we export matches what the candidate sees.
    const cur = editingRef.current
    let finalTexts = texts
    if (cur && cur.value.trim()) {
      if (cur.index == null) {
        finalTexts = [...texts, { x: cur.x, y: cur.y, text: cur.value.trim(), color: cur.color, size: TEXT_SIZE }]
      } else {
        finalTexts = texts.map((t, i) => (i === cur.index ? { ...t, text: cur.value.trim() } : t))
      }
    }
    paint(strokes, finalTexts)
    commitEditing()

    const maxDim = 1024
    let out = canvas
    if (canvas.width > maxDim || canvas.height > maxDim) {
      const scale = Math.min(maxDim / canvas.width, maxDim / canvas.height)
      const offscreen = document.createElement("canvas")
      offscreen.width = Math.round(canvas.width * scale)
      offscreen.height = Math.round(canvas.height * scale)
      const ctx = offscreen.getContext("2d")
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height)
        out = offscreen
      }
    }

    onExport(out.toDataURL("image/jpeg", 0.7))
  }

  function hasContent(): boolean {
    return strokes.length > 0 || texts.length > 0 || !!editing?.value.trim()
  }

  const editingLines = editing ? Math.max(1, editing.value.split("\n").length) : 1

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-[#1e293b] border-b border-[#334155] flex-wrap">
        <button
          onClick={() => setTool("pen")}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            tool === "pen"
              ? "bg-blue-600 text-white"
              : "bg-[#334155] text-slate-300 hover:bg-[#475569]"
          }`}
        >
          Pen
        </button>
        <button
          onClick={() => setTool("eraser")}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            tool === "eraser"
              ? "bg-blue-600 text-white"
              : "bg-[#334155] text-slate-300 hover:bg-[#475569]"
          }`}
        >
          Eraser
        </button>
        <button
          onClick={() => {
            if (editing) commitEditing()
            setTool("text")
          }}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            tool === "text"
              ? "bg-blue-600 text-white"
              : "bg-[#334155] text-slate-300 hover:bg-[#475569]"
          }`}
          title="Click the board to place a text box"
        >
          Text
        </button>

        <div className="w-px h-6 bg-[#475569]" />

        {/* Colors (apply to pen and new text boxes) */}
        {COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => { setColor(c.value); if (tool === "eraser") setTool("pen") }}
            className={`w-6 h-6 rounded-full border-2 transition-all ${
              color === c.value && tool !== "eraser"
                ? "border-blue-400 scale-110"
                : "border-[#475569]"
            }`}
            style={{ backgroundColor: c.value }}
            title={c.name}
          />
        ))}

        <div className="w-px h-6 bg-[#475569]" />

        {/* Pen sizes */}
        {PEN_SIZES.map((size) => (
          <button
            key={size}
            onClick={() => setPenSize(size)}
            className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
              penSize === size && tool === "pen"
                ? "bg-blue-600/30 border border-blue-500"
                : "bg-[#334155] hover:bg-[#475569]"
            }`}
          >
            <div
              className="rounded-full bg-white"
              style={{ width: size + 2, height: size + 2 }}
            />
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="px-3 py-1.5 rounded text-sm text-slate-300 bg-[#334155] hover:bg-[#475569] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Undo
        </button>
        <button
          onClick={clearCanvas}
          disabled={strokes.length === 0 && texts.length === 0 && !editing}
          className="px-3 py-1.5 rounded text-sm text-red-400 bg-[#334155] hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Clear
        </button>
        <button
          onClick={exportCanvas}
          disabled={disabled || !hasContent()}
          className="px-4 py-1.5 rounded text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Submit Whiteboard
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 bg-white relative"
        style={{ cursor: tool === "text" ? "text" : "crosshair" }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          className="absolute inset-0 touch-none"
        />

        {/* Inline text editor overlay */}
        {editing && (
          <textarea
            ref={textareaRef}
            value={editing.value}
            onChange={(e) => updateEditingValue(e.target.value)}
            onBlur={commitEditing}
            onKeyDown={(e) => {
              if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
                e.preventDefault()
                commitEditing()
              }
            }}
            spellCheck={false}
            rows={editingLines}
            className="absolute z-10 bg-white/95 outline-none resize-none border border-blue-400 rounded px-1 py-0 shadow-sm leading-tight overflow-hidden"
            style={{
              left: editing.x,
              top: editing.y,
              color: editing.color,
              fontSize: TEXT_SIZE,
              lineHeight: `${TEXT_SIZE * TEXT_LINE_HEIGHT}px`,
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
              minWidth: 60,
              maxWidth: "80%",
              width: `${Math.max(6, Math.max(...editing.value.split("\n").map((l) => l.length), 6))}ch`,
            }}
          />
        )}

        {tool === "text" && !editing && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none bg-slate-800/80 text-slate-200 text-xs px-3 py-1 rounded-full">
            Click anywhere to add a text box · Esc or click away to place it
          </div>
        )}

        {disabled && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center px-6">
            <div className="bg-white/90 border border-slate-300 rounded-lg px-5 py-4 max-w-sm text-center shadow-lg">
              <div className="text-slate-700 text-sm font-medium">Whiteboard locked</div>
              <div className="text-slate-500 text-xs mt-1">
                {disabledReason || "Complete the current step to unlock the whiteboard."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
