let cached: { url: string; token: string } | null = null

export async function getBackendCredentials(): Promise<{ url: string; token: string }> {
  if (!cached) cached = await window.electronAPI.getBackend()
  return cached
}

export function resetBackendCredentials(): void {
  cached = null
}

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const { url, token } = await getBackendCredentials()
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${url}${path}`, { ...init, headers })
}

export async function backendWsUrl(path: string): Promise<string> {
  const { url, token } = await getBackendCredentials()
  const ws = url.replace('http://', 'ws://')
  const sep = path.includes('?') ? '&' : '?'
  return `${ws}${path}${sep}token=${token}`
}

export const deleteWorkflow = (workflowId: string) =>
  backendFetch(`/api/workflows/${workflowId}`, { method: 'DELETE' })

export const renameWorkflow = (workflowId: string, name: string) =>
  backendFetch(`/api/workflows/${workflowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })

export const duplicateWorkflow = (workflowId: string, name?: string) =>
  backendFetch(`/api/workflows/${workflowId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name ?? null })
  })
