import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from 'cmdk'
import { X, AlertCircle, ChevronDown, Check } from 'lucide-react'
import { Button } from './ui/button'
import type { ComfyUIWorkflow, ProxyWidget } from './ComfyUIWorkflowManager'

interface Props {
  isOpen: boolean
  onClose: () => void
  workflow: ComfyUIWorkflow
  onSave: (pipeline: string, mapping: Record<string, ProxyWidget>) => void
}

const PIPELINE_TYPES = [
  { id: 'image_gen', label: 'Image Generation' },
  { id: 'video_gen', label: 'Video Generation' },
  { id: 'retake', label: 'Video Retake' },
  { id: 'ic_lora', label: 'IC-LoRA' },
]

const FIELD_LABELS: Record<string, string> = {
  prompt: 'Positive Prompt',
  negative_prompt: 'Negative Prompt',
  seed: 'Seed / Noise',
  width: 'Width',
  height: 'Height',
  num_inference_steps: 'Inference Steps',
  num_frames: 'Frame Count',
  frame_rate: 'FPS',
  video_path: 'Input Video',
  mask_path: 'Input Mask',
  audio_path: 'Input Audio',
  start_time: 'Start Time',
  end_time: 'End Time',
}

const PIPELINE_FIELDS: Record<string, string[]> = {
  image_gen: ['prompt', 'negative_prompt', 'seed', 'width', 'height', 'num_inference_steps'],
  video_gen: ['prompt', 'negative_prompt', 'seed', 'width', 'height', 'num_frames', 'frame_rate', 'image_path', 'audio_path'],
  retake: ['video_path', 'mask_path', 'prompt', 'seed', 'start_time', 'end_time'],
  ic_lora: ['prompt', 'seed', 'height', 'width', 'num_frames', 'frame_rate'],
}

const REQUIRED_KEYS: Record<string, string[]> = {
  image_gen: ['prompt', 'seed', 'width', 'height'],
  video_gen: ['prompt', 'seed', 'width', 'height', 'num_frames', 'frame_rate'],
  retake: ['video_path', 'mask_path', 'prompt', 'seed', 'start_time', 'end_time'],
  ic_lora: ['prompt', 'seed', 'height', 'width', 'num_frames', 'frame_rate'],
}

// Predefined color palette for node type tags (text color, bg color, border color)
const NODE_TYPE_COLORS = [
  { text: 'text-blue-400', bg: 'bg-blue-500/15', border: 'border-blue-500/30' },
  { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
  { text: 'text-pink-400', bg: 'bg-pink-500/15', border: 'border-pink-500/30' },
  { text: 'text-cyan-400', bg: 'bg-cyan-500/15', border: 'border-cyan-500/30' },
  { text: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/30' },
  { text: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30' },
  { text: 'text-teal-400', bg: 'bg-teal-500/15', border: 'border-teal-500/30' },
  { text: 'text-rose-400', bg: 'bg-rose-500/15', border: 'border-rose-500/30' },
  { text: 'text-indigo-400', bg: 'bg-indigo-500/15', border: 'border-indigo-500/30' },
  { text: 'text-lime-400', bg: 'bg-lime-500/15', border: 'border-lime-500/30' },
  { text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/30' },
]

/**
 * Deterministic hash function to assign consistent colors to node types.
 * Uses a simple djb2-style hash to map node type strings to color indices.
 */
function getNodeTypeColorIndex(nodeType: string): number {
  let hash = 5381
  for (let i = 0; i < nodeType.length; i++) {
    hash = ((hash << 5) + hash) + nodeType.charCodeAt(i)
    hash = hash & hash // Convert to 32bit int
  }
  return Math.abs(hash) % NODE_TYPE_COLORS.length
}

interface NodeSelectOption {
  id: string
  label: string
  node_title: string
  class_type: string
}

interface NodeSelectProps {
  value: string
  onChange: (value: string) => void
  options: NodeSelectOption[]
}

/**
 * Custom dropdown component that renders options with colored type tags.
 * Uses cmdk for searchable combobox with proper portal rendering.
 */
function NodeSelect({ value, onChange, options }: NodeSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null)

  // Build color map for node types (class_type)
  const colorMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const opt of options) {
      if (opt.class_type && !map.has(opt.class_type)) {
        map.set(opt.class_type, getNodeTypeColorIndex(opt.class_type))
      }
    }
    return map
  }, [options])

  // Filter options based on search (case-insensitive, match label, node_title, and class_type)
  const filteredOptions = useMemo(() => {
    if (!search) return options
    const lower = search.toLowerCase()
    return options.filter(opt =>
      opt.label.toLowerCase().includes(lower) ||
      opt.node_title?.toLowerCase().includes(lower) ||
      opt.class_type?.toLowerCase().includes(lower)
    )
  }, [options, search])

  // Handle click outside to close dropdown
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    setOpen(!open)
  }

  const handleSelect = (id: string) => {
    onChange(id)
    setOpen(false)
    setPosition(null)
    setSearch('')
  }

  const selectedOption = options.find(o => o.id === value)
  const selectedClassType = selectedOption?.class_type ?? ''

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={containerRef}
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-3 py-2 hover:border-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
      >
        {selectedOption ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">{selectedOption.label}</span>
            {selectedClassType && (
              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                (() => {
                  const ci = colorMap.get(selectedClassType) ?? 0
                  return NODE_TYPE_COLORS[ci]
                })()
              }`}>
                {selectedClassType}
              </span>
            )}
          </div>
        ) : (
          <span className="text-zinc-500">Not Mapped</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-zinc-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown rendered via portal to escape overflow clipping */}
      {open && position && createPortal(
        <div
          ref={dropdownRef}
          className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Command
            className="bg-zinc-900"
            label="Node selector"
            shouldFilter={false}
          >
            <div className="border-b border-zinc-700">
              <CommandInput
                placeholder="Search nodes..."
                value={search}
                onValueChange={setSearch}
                className="text-xs bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:outline-none px-3 py-2 w-full"
              />
            </div>
            <CommandList className="max-h-48 overflow-y-auto">
              <CommandEmpty className="px-3 py-4 text-xs text-zinc-500 text-center">
                No matching nodes
              </CommandEmpty>
              <CommandGroup>
                {/* Not Mapped option */}
                <CommandItem
                  value="not_mapped"
                  onSelect={() => handleSelect('')}
                  className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-white text-zinc-400"
                >
                  <span className="w-4 flex-shrink-0">
                    {!value && <Check className="h-3.5 w-3.5 text-blue-400" />}
                  </span>
                  <span>Not Mapped</span>
                </CommandItem>
                {/* Options */}
                {filteredOptions.map((opt) => {
                  const classType = opt.class_type ?? ''
                  const colorIndex = opt.class_type ? (colorMap.get(opt.class_type) ?? 0) : 0
                  const colors = NODE_TYPE_COLORS[colorIndex]

                  return (
                    <CommandItem
                      key={opt.id}
                      value={opt.id}
                      onSelect={() => handleSelect(opt.id)}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer data-[selected=true]:bg-zinc-800 data-[selected=true]:text-white text-zinc-300"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="w-4 flex-shrink-0">
                          {opt.id === value && <Check className="h-3.5 w-3.5 text-blue-400" />}
                        </span>
                        <span className="truncate">{opt.label}</span>
                      </div>
                      {classType && (
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors}`}>
                          {classType}
                        </span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      , document.body)}
    </div>
  )
}

export function ComfyUIMappingModal({ isOpen, onClose, workflow, onSave }: Props) {
  const [pipeline, setPipeline] = useState(workflow.pipeline)
  const [mapping, setMapping] = useState<Record<string, ProxyWidget>>(workflow.ui_mapping)

  useEffect(() => {
    setPipeline(workflow.pipeline)
    setMapping(workflow.ui_mapping)
  }, [workflow])

  if (!isOpen) return null

  const fields = PIPELINE_FIELDS[pipeline] || []

  const handleMapField = (fieldKey: string, inputId: string) => {
    if (!inputId) {
      const next = { ...mapping }
      delete next[fieldKey]
      setMapping(next)
      return
    }

    const input = workflow.all_inputs.find(i => i.id === inputId)
    if (input) {
      setMapping(prev => ({
        ...prev,
        [fieldKey]: { node: input.node, field: input.field }
      }))
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Map Workflow: {workflow.name}</h2>
            <p className="text-xs text-zinc-500">Assign this workflow to a pipeline and link UI fields to nodes.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Pipeline Selection */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Target Pipeline</label>
            <div className="grid grid-cols-2 gap-2">
              {PIPELINE_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setPipeline(type.id)}
                  className={`px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    pipeline === type.id
                      ? 'bg-blue-500/10 border-blue-500 text-white'
                      : 'bg-zinc-800/50 border-transparent text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-sm font-medium">{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Field Mapping */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">UI Mappings</label>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 italic">
                <AlertCircle className="h-3 w-3" />
                Available fields for {PIPELINE_TYPES.find(p => p.id === pipeline)?.label}
              </div>
            </div>

            <div className="space-y-3">
              {fields.map((fieldKey) => {
                const current = mapping[fieldKey]
                // Find the input ID that matches the current mapping (node + field)
                const currentInput = current 
                  ? workflow.all_inputs.find(i => i.node === current.node && i.field === current.field)
                  : null
                const value = currentInput ? currentInput.id : ''
                
                const selectOptions: NodeSelectOption[] = workflow.all_inputs.map(i => ({
                  id: i.id,
                  label: i.label,
                  node_title: i.node_title,
                  class_type: i.class_type
                }))

                return (
                  <div key={fieldKey} className="grid grid-cols-[1fr,1.5fr] items-center gap-4 p-3 rounded-xl bg-zinc-800/30 border border-zinc-800/50">
                    <span className="text-xs font-medium text-zinc-300">
                      {FIELD_LABELS[fieldKey] || fieldKey}
                      {!REQUIRED_KEYS[pipeline]?.includes(fieldKey) && <span className="text-zinc-500 font-normal ml-1.5">(Optional)</span>}
                    </span>
                    <NodeSelect
                      value={value}
                      onChange={(newVal) => handleMapField(fieldKey, newVal)}
                      options={selectOptions}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-800/50 border-t border-zinc-800 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="text-zinc-400 hover:text-white">
            Cancel
          </Button>
          <Button
            onClick={() => onSave(pipeline, mapping)}
            className="bg-blue-600 hover:bg-blue-500 text-white min-w-[100px]"
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  )
}
