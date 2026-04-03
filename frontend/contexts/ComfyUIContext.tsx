import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { backendFetch } from '../lib/backend'

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

interface ComfyUIContextValue {
  workflows: ComfyUIWorkflow[]
  isLoading: boolean
  refreshWorkflows: () => Promise<void>
}

const ComfyUIContext = createContext<ComfyUIContextValue | null>(null)

export function ComfyUIProvider({ children }: { children: ReactNode }) {
  const [workflows, setWorkflows] = useState<ComfyUIWorkflow[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refreshWorkflows = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await backendFetch('/api/workflows')
      if (res.ok) {
        const data = await res.json()
        setWorkflows(data)
      }
    } catch (e) {
      console.error('Failed to fetch comfy workflows', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshWorkflows()
  }, [refreshWorkflows])

  return (
    <ComfyUIContext.Provider value={{ workflows, isLoading, refreshWorkflows }}>
      {children}
    </ComfyUIContext.Provider>
  )
}

export function useComfyUI() {
  const context = useContext(ComfyUIContext)
  if (!context) {
    throw new Error('useComfyUI must be used within a ComfyUIProvider')
  }
  return context
}
