import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
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
  all_inputs: { id: string; label: string; node: string; field: string; node_title: string }[]
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
  const hasFetchedRef = useRef(false)

  const refreshWorkflows = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await backendFetch('/api/workflows')
      if (!res.ok) return
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        // Expected on mount before backend is ready (Vite returns index.html); silently skip
        return
      }
      const data = await res.json()
      setWorkflows(data)
      hasFetchedRef.current = true
    } catch (e) {
      console.error('Failed to fetch comfy workflows', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount (may fail if backend not ready yet)
  useEffect(() => {
    void refreshWorkflows()
  }, [refreshWorkflows])

  // Re-fetch when backend health status changes to 'alive'
  useEffect(() => {
    const unsubscribe = window.electronAPI.onBackendHealthStatus((data) => {
      if (data?.status === 'alive') {
        void refreshWorkflows()
      }
    })
    return unsubscribe
  }, [refreshWorkflows])

  // Also listen for the custom backend-ready event (for compatibility with App.tsx startup flow)
  useEffect(() => {
    const handler = () => {
      void refreshWorkflows()
    }
    window.addEventListener('backend-ready', handler)
    return () => window.removeEventListener('backend-ready', handler)
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
