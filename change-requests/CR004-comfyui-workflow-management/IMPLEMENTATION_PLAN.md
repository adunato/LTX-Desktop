# Implementation Plan: ComfyUI Workflow Management

This plan outlines the implementation of workflow management operations: import collision resolution, duplicate, delete, and rename.

## Phase 1: Backend — Workflow Parser Extensions (COMPLETED → PLANNED)

**Goal:** Add core functions to `workflow_parser.py` for CRUD operations.

### 1.1. `delete_workflow` (PLANNED)

```python
def delete_workflow(workflow_id: str) -> None:
    """Delete workflow JSON and config files."""
    workflow_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    config_path = WORKFLOWS_DIR / f"{workflow_id}.config.json"
    workflow_path.unlink(missing_ok=True)
    config_path.unlink(missing_ok=True)
```

### 1.2. `rename_workflow` (PLANNED)

```python
def rename_workflow(workflow_id: str, new_name: str) -> None:
    """Update the display name in the workflow JSON (does not change file/ID)."""
    file_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not file_path.exists():
        raise FileNotFoundError(f"Workflow '{workflow_id}' not found")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["name"] = new_name
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
```

### 1.3. `duplicate_workflow` (PLANNED)

```python
def duplicate_workflow(workflow_id: str, new_name: str | None = None) -> str:
    """Copy workflow + config to a new unique ID. Returns new workflow_id."""
    source_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not source_path.exists():
        raise FileNotFoundError(f"Workflow '{workflow_id}' not found")
    
    # Generate unique ID
    stem = workflow_id
    counter = 1
    while (WORKFLOWS_DIR / f"{stem}_{counter}.json").exists():
        counter += 1
    new_id = f"{stem}_{counter}"
    
    # Copy workflow
    target_path = WORKFLOWS_DIR / f"{new_id}.json"
    shutil.copy2(source_path, target_path)
    
    # Update name
    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["name"] = new_name or f"{data.get('name', workflow_id)} (copy)"
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    
    # Copy config if exists
    source_config = WORKFLOWS_DIR / f"{workflow_id}.config.json"
    if source_config.exists():
        target_config = WORKFLOWS_DIR / f"{new_id}.config.json"
        shutil.copy2(source_config, target_config)
    
    return new_id
```

### 1.4. `import_workflow` Collision Resolution (PLANNED)

Modify existing `import_workflow` to handle filename collisions:

```python
def import_workflow(file_path: Path, original_filename: str | None = None, name: str | None = None) -> str:
    if not file_path.exists():
        raise ValueError("File does not exist")
    
    base_filename = original_filename if original_filename else file_path.name
    target_path = WORKFLOWS_DIR / base_filename
    
    # Handle collision
    if target_path.exists():
        stem = target_path.stem
        suffix = target_path.suffix  # .json
        counter = 1
        while target_path.exists():
            target_path = WORKFLOWS_DIR / f"{stem}_{counter}{suffix}"
            counter += 1
    
    # Copy file
    shutil.copy2(file_path, target_path)
    workflow_id = target_path.stem
    
    # Set name if provided
    if name:
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["name"] = name
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    
    return workflow_id
```

## Phase 2: Backend — API Routes (PLANNED)

**Goal:** Add REST endpoints to `_routes/workflows.py`.

### 2.1. DELETE `/api/workflows/{workflow_id}` (PLANNED)

```python
@router.delete("/{workflow_id}")
def delete_workflow_endpoint(workflow_id: str):
    from services.comfyui.workflow_parser import delete_workflow, WORKFLOWS_DIR
    
    # Validate workflow_id
    if not re.match(r"^[a-zA-Z0-9_-]+$", workflow_id):
        raise HTTPException(400, "Invalid workflow ID")
    
    workflow_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not workflow_path.exists():
        raise HTTPException(404, "Workflow not found")
    
    delete_workflow(workflow_id)
    return {"status": "success"}
```

### 2.2. PATCH `/api/workflows/{workflow_id}` (PLANNED)

```python
from pydantic import BaseModel

class RenameRequest(BaseModel):
    name: str

@router.patch("/{workflow_id}")
def rename_workflow_endpoint(workflow_id: str, body: RenameRequest):
    from services.comfyui.workflow_parser import rename_workflow
    
    if not re.match(r"^[a-zA-Z0-9_-]+$", workflow_id):
        raise HTTPException(400, "Invalid workflow ID")
    
    try:
        rename_workflow(workflow_id, body.name)
        return {"status": "success", "id": workflow_id}
    except FileNotFoundError:
        raise HTTPException(404, "Workflow not found")
```

### 2.3. POST `/api/workflows/{workflow_id}/duplicate` (PLANNED)

```python
class DuplicateRequest(BaseModel):
    name: str | None = None

@router.post("/{workflow_id}/duplicate")
def duplicate_workflow_endpoint(workflow_id: str, body: DuplicateRequest | None = None):
    from services.comfyui.workflow_parser import duplicate_workflow
    
    if not re.match(r"^[a-zA-Z0-9_-]+$", workflow_id):
        raise HTTPException(400, "Invalid workflow ID")
    
    try:
        new_id = duplicate_workflow(workflow_id, body.name if body else None)
        return {"status": "success", "id": new_id}
    except FileNotFoundError:
        raise HTTPException(404, "Workflow not found")
```

### 2.4. Update existing `upload_workflow` (PLANNED)

The existing import endpoint already calls `import_workflow` — no changes needed after Phase 1.4 collision resolution is implemented.

## Phase 3: Frontend — Workflow Management UI (PLANNED)

**Goal:** Add action buttons to workflow list in `SettingsModal.tsx`.

### 3.1. Workflow Row Actions (PLANNED)

Add to each workflow item in the list:

| Action | Icon | Handler |
|--------|------|---------|
| Duplicate | 📋 `Copy` | `POST /api/workflows/{id}/duplicate` → refresh list |
| Rename | ✏️ `Pencil` | Open inline edit or modal → `PATCH /api/workflows/{id}` → refresh |
| Delete | 🗑️ `Trash2` | Confirm dialog → `DELETE /api/workflows/{id}` → refresh |

### 3.2. Rename UX Options (PLANNED)

**Option A: Inline Editing**
- Click pencil icon → text input replaces name label
- Enter to save, Escape to cancel
- Simple, fast interaction

**Option B: Modal Dialog**
- Click pencil → modal with name input
- More consistent with existing mapping modal patterns
- Slightly more friction

**Recommendation**: Option A (inline) for simplicity and speed.

### 3.3. Delete Confirmation (PLANNED)

- Native `window.confirm()` or custom dialog component
- Message: `"Delete workflow '{name}'? This action cannot be undone."`
- Red destructive button styling

### 3.4. API Integration (PLANNED)

Add to `frontend/lib/backend.ts` or create workflow API helper:

```typescript
export const deleteWorkflow = (workflowId: string) => 
  backendFetch(`/api/workflows/${workflowId}`, { method: 'DELETE' });

export const renameWorkflow = (workflowId: string, name: string) =>
  backendFetch(`/api/workflows/${workflowId}`, { 
    method: 'PATCH', 
    body: JSON.stringify({ name }) 
  });

export const duplicateWorkflow = (workflowId: string, name?: string) =>
  backendFetch(`/api/workflows/${workflowId}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({ name })
  });
```

## Phase 4: Validation (PLANNED)

### 4.1. Backend Tests (PLANNED)

- Test import collision: import `workflow.json` 3 times → verify `workflow`, `workflow_1`, `workflow_2`
- Test duplicate: verify new ID, config copied, name updated
- Test delete: verify files removed, subsequent GET returns 404
- Test rename: verify ID stable, name field changed
- Test path traversal: reject `workflow_id` with `../` patterns

### 4.2. Manual Testing Checklist (PLANNED)

- [x] Import same workflow file twice → verify both appear with different IDs
- [x] Duplicate a workflow → verify copy appears with `(copy)` suffix
- [x] Rename a workflow → verify display name changes, ID stays same
- [x] Delete a workflow → verify removed from list and filesystem
- [x] Delete a workflow with config → verify both `.json` and `.config.json` removed
- [x] Duplicate a workflow with config → verify config copied to new ID
- [x] Verify generation still works after rename/duplicate operations

## Files Changed (Estimated)

| File | Lines | Description |
|------|-------|-------------|
| `backend/services/comfyui/workflow_parser.py` | +80 | delete, rename, duplicate, collision handling |
| `backend/_routes/workflows.py` | +60 | DELETE, PATCH, POST/duplicate endpoints |
| `frontend/components/SettingsModal.tsx` | +80 | Action buttons, inline rename, delete confirm |
| `frontend/lib/backend.ts` or new helper | +20 | API helper functions |
| `backend/tests/test_workflow_management.py` | +100 | Integration tests |

**Total:** ~340 lines added

## Dependencies

- CR001: ComfyUI Foundation (existing workflow routes, parser, settings)
- CR003: ComfyUI Video Generation (workflow_id routing — unaffected by this CR)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Workflow ID change breaks generation references | High | Rename does not change ID; only display name updates |
| Config not copied on duplicate | Medium | Test verifies config file existence after duplicate |
| Path traversal vulnerability | High | Regex validation `^[a-zA-Z0-9_-]+$` on all workflow_id inputs |
| Frontend state out of sync after mutation | Medium | Refresh workflow list after each mutation |
