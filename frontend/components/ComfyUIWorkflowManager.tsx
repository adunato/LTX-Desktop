import { useState, useEffect } from 'react'
import { Plus, Settings, Loader2, Upload, AlertCircle } from 'lucide-react'
import { Button } from './ui/button'
import { backendFetch } from '../lib/backend'
import { ComfyUIMappingModal } from './ComfyUIMappingModal'

export interface ProxyWidget {
  node: string
  field: string
}

export interface ComfyUIWorkflow {
  id: string
  name: string
  pipeline: string
  ui_mapping: Record<string, ProxyWidget>
  is_healthy: boolean
  all_inputs: { id: string; label: string; node: string; field: string }[]
}

export function ComfyUIWorkflowManager() {
  const [workflows, setWorkflows] = useState<ComfyUIWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWorkflow, setSelectedWorkflow] = useState<ComfyUIWorkflow | null>(null)
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkflows = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await backendFetch('/api/workflows')
      if (res.ok) {
        const data = await res.json()
        setWorkflows(data)
      } else {
        setError('Failed to load workflows from server.')
      }
    } catch (e) {
      console.error('Failed to fetch workflows', e)
      setError('Connection error while fetching workflows.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkflows()
  }, [])

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setIsImporting(true)
      setError(null)
      const formData = new FormData()
      formData.append('file', file)
      
      try {
        const res = await backendFetch('/api/workflows/import', {
          method: 'POST',
          body: formData,
        })
        if (res.ok) {
          await fetchWorkflows()
        } else {
          try {
            const data = await res.json()
            setError(data.error || 'Import failed. Check if the file is a valid ComfyUI JSON.')
          } catch {
            setError('Import failed. Server returned an error.')
          }
        }
      } catch (e) {
        console.error('Import failed', e)
        setError('Connection error during import.')
      } finally {
        setIsImporting(false)
      }
    }
    input.click()
  }

  const handleConfigSave = async (workflowId: string, pipeline: string, mapping: Record<string, ProxyWidget>) => {
    try {
      const res = await backendFetch(`/api/workflows/${workflowId}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline, ui_mapping: mapping }),
      })
      if (res.ok) {
        await fetchWorkflows()
        setIsMappingModalOpen(false)
      }
    } catch (e) {
      console.error('Failed to save config', e)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">ComfyUI Workflows</h3>
          <p className="text-xs text-zinc-500">Import and map ComfyUI JSON workflows to LTX pipelines.</p>
        </div>
        <Button 
          onClick={handleImport} 
          disabled={isImporting}
          size="sm"
          className="bg-blue-600 hover:bg-blue-500 text-white gap-2"
        >
          {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Import JSON
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-900/30 text-center">
          <Upload className="h-10 w-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400">No workflows imported yet.</p>
          <p className="text-xs text-zinc-600 mt-1">Import a ComfyUI JSON file to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {workflows.map((wf) => (
            <div 
              key={wf.id}
              className="flex items-center justify-between p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600 transition-all"
            >
              <div className="flex items-center gap-4">
                {/* Health LED */}
                <div 
                  className={`h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${
                    wf.is_healthy ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50'
                  }`} 
                  title={wf.is_healthy ? 'Valid Mapping' : 'Invalid Mapping'}
                />
                <div>
                  <h4 className="text-sm font-medium text-zinc-200">{wf.name}</h4>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                    Assigned to: {wf.pipeline.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white hover:bg-zinc-700"
                onClick={() => {
                  setSelectedWorkflow(wf)
                  setIsMappingModalOpen(true)
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {selectedWorkflow && (
        <ComfyUIMappingModal
          isOpen={isMappingModalOpen}
          onClose={() => setIsMappingModalOpen(false)}
          workflow={selectedWorkflow}
          onSave={(pipeline, mapping) => handleConfigSave(selectedWorkflow.id, pipeline, mapping)}
        />
      )}
    </div>
  )
}
