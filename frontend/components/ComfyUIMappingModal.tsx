import { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
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

const REQUIRED_FIELDS: Record<string, string[]> = {
  image_gen: ['prompt', 'seed', 'width', 'height', 'num_inference_steps'],
  video_gen: ['prompt', 'seed', 'width', 'height', 'num_frames', 'frame_rate'],
  retake: ['video_path', 'mask_path', 'prompt', 'seed', 'start_time', 'end_time'],
  ic_lora: ['prompt', 'seed', 'height', 'width', 'num_frames', 'frame_rate'],
}

export function ComfyUIMappingModal({ isOpen, onClose, workflow, onSave }: Props) {
  const [pipeline, setPipeline] = useState(workflow.pipeline)
  const [mapping, setMapping] = useState<Record<string, ProxyWidget>>(workflow.ui_mapping)

  useEffect(() => {
    setPipeline(workflow.pipeline)
    setMapping(workflow.ui_mapping)
  }, [workflow])

  if (!isOpen) return null

  const fields = REQUIRED_FIELDS[pipeline] || []

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
                Required for {PIPELINE_TYPES.find(p => p.id === pipeline)?.label}
              </div>
            </div>

            <div className="space-y-3">
              {fields.map((fieldKey) => {
                const current = mapping[fieldKey]
                const value = current ? `${current.node}:${current.field}` : ''
                
                return (
                  <div key={fieldKey} className="grid grid-cols-[1fr,1.5fr] items-center gap-4 p-3 rounded-xl bg-zinc-800/30 border border-zinc-800/50">
                    <span className="text-xs font-medium text-zinc-300">{FIELD_LABELS[fieldKey] || fieldKey}</span>
                    <select
                      value={value}
                      onChange={(e) => handleMapField(fieldKey, e.target.value)}
                      className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="">Not Mapped</option>
                      {workflow.all_inputs.map((input) => (
                        <option key={input.id} value={input.id}>
                          {input.label}
                        </option>
                      ))}
                    </select>
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
