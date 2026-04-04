import { useState, useEffect } from 'react'
import { Sliders, ChevronDown, Loader2 } from 'lucide-react'
import { backendFetch } from '../lib/backend'

export interface ProxyWidget {
  node: string
  field: string
}

export interface ComfyUIWorkflow {
  id: string
  name: string
  proxyWidgets: Record<string, ProxyWidget>
}

interface Props {
  selectedWorkflowId: string | null
  onWorkflowSelect: (workflow: ComfyUIWorkflow) => void
}

export function ComfyUIWorkflowSelector({ selectedWorkflowId, onWorkflowSelect }: Props) {
  const [workflows, setWorkflows] = useState<ComfyUIWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const res = await backendFetch('/api/workflows')
        if (res.ok) {
          const data = await res.json()
          setWorkflows(data)
          if (data.length > 0 && !selectedWorkflowId) {
            onWorkflowSelect(data[0])
          } else if (selectedWorkflowId) {
            const current = data.find((w: ComfyUIWorkflow) => w.id === selectedWorkflowId)
            if (current) onWorkflowSelect(current)
          }
        }
      } catch (e) {
        console.error('Failed to fetch workflows', e)
      } finally {
        setLoading(false)
      }
    }
    fetchWorkflows()
  }, [])

  const currentWorkflow = workflows.find(w => w.id === selectedWorkflowId)

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800/50 text-zinc-400 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Loading workflows...</span>
      </div>
    )
  }

  if (workflows.length === 0) {
    return (
      <div className="px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 text-xs border border-red-500/20">
        No workflows found
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 transition-colors border border-zinc-700"
      >
        <Sliders className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-zinc-200 text-xs font-medium">
          {currentWorkflow?.name || 'Select Workflow'}
        </span>
        <ChevronDown className="h-3 w-3 text-zinc-500" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full mb-2 left-0 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-1">
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-800/50">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Workflows</span>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {workflows.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    onWorkflowSelect(w)
                    setIsOpen(false)
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-zinc-800 ${
                    w.id === selectedWorkflowId ? 'text-blue-400 bg-blue-500/5' : 'text-zinc-300'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
