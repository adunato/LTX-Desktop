# High-Level Design: ComfyUI Workflow Management

## 1. Overview

This change request extends the ComfyUI integration (CR001, CR003) with comprehensive workflow management capabilities. Currently, workflows can be imported and configured, but users lack basic file management operations: importing the same workflow under different names, duplicating, deleting, and renaming workflows. These operations are essential for users who want to maintain workflow variants (e.g., different resolutions, different parameter presets) derived from the same base workflow.

## 2. Problem Statement

### 2.1. Current Limitations

1. **Import Collision**: When importing the same JSON file twice, the second import overwrites the first because the `workflow_id` is derived from the filename. Users cannot maintain multiple variants of the same base workflow.
2. **No Duplicate Operation**: Users must manually re-import and re-configure a workflow to create a variant, losing all mapping configurations.
3. **No Delete Operation**: Workflows can only be removed by manually deleting files from the `workflows/` directory.
4. **No Rename Operation**: Workflow names can only be changed by editing the JSON `name` field manually or re-importing with a different name.

### 2.2. User Goals

- Maintain multiple variants of a base workflow (e.g., `ltx_video_t2v_540p`, `ltx_video_t2v_1080p`)
- Quickly clone a workflow to experiment with different settings
- Remove unused workflows from the UI
- Give workflows meaningful names for organization

## 3. Design Principles

- **Additive Isolation**: All new endpoints and services are added alongside existing code. No modifications to existing import, generation, or pipeline logic.
- **Workflow ID Stability**: The `workflow_id` is the stable identifier used by generation handlers. Rename operations update the display name without changing the ID.
- **Config Portability**: When duplicating a workflow, the `.config.json` (mappings, pipeline assignment) is copied alongside the workflow JSON.

## 4. Architecture

### 4.1. Backend Changes

#### 4.1.1. New Routes (`backend/_routes/workflows.py`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/workflows` | Import workflow (existing — **modified** to handle name collisions) |
| `DELETE` | `/api/workflows/{workflow_id}` | Delete a workflow and its config |
| `PATCH` | `/api/workflows/{workflow_id}` | Rename a workflow (updates display name in JSON) |
| `POST` | `/api/workflows/{workflow_id}/duplicate` | Duplicate a workflow with a new ID and copied config |

#### 4.1.2. Workflow Parser Extensions (`backend/services/comfyui/workflow_parser.py`)

New functions:

- `delete_workflow(workflow_id: str) -> None`: Removes `{workflow_id}.json` and `{workflow_id}.config.json` from `WORKFLOWS_DIR`
- `rename_workflow(workflow_id: str, new_name: str) -> None`: Updates the `name` field in the workflow JSON file
- `duplicate_workflow(workflow_id: str, new_name: str | None = None) -> str`: Copies workflow JSON + config to a new ID, returns new workflow_id

Modified function:

- `import_workflow(...)`: Updated to handle filename collisions by appending a numeric suffix (e.g., `workflow.json` → `workflow_1.json`, `workflow_2.json`)

#### 4.1.3. Import Collision Resolution

When importing a file with a name that already exists in `WORKFLOWS_DIR/`:

1. Check if `{target_filename}` exists
2. If yes, find next available suffix: `{stem}_{n}.json` where n = 1, 2, 3...
3. Use the unique filename as the new `workflow_id`
4. This allows the same JSON structure to be imported multiple times with independent configurations

### 4.2. Frontend Changes

#### 4.2.1. Workflow Management Tab (`SettingsModal.tsx`)

Add action buttons/icons to each workflow row:

| Icon | Action | Description |
|------|--------|-------------|
| 📋 Duplicate | Clone workflow | Creates a copy with `{original_name} (copy)` suffix |
| ✏️ Rename | Edit name | Inline text input or modal to enter new display name |
| 🗑️ Delete | Remove workflow | Confirmation dialog → DELETE request |

#### 4.2.2. Import Behavior

- File picker → Upload → Backend resolves collisions automatically
- No UI changes needed for import; backend handles uniqueness

### 4.3. API Contracts

#### DELETE `/api/workflows/{workflow_id}`

**Request:**
```
DELETE /api/workflows/ltx_video_t2v
```

**Response:**
```json
{ "status": "success" }
```

**Errors:**
- `404`: Workflow not found

#### PATCH `/api/workflows/{workflow_id}`

**Request:**
```json
{ "name": "My Custom T2V Workflow" }
```

**Response:**
```json
{ "status": "success", "id": "ltx_video_t2v" }
```

**Errors:**
- `404`: Workflow not found

#### POST `/api/workflows/{workflow_id}/duplicate`

**Request:**
```json
{ "name": "T2V 1080p Variant" }  // optional, defaults to "{original} (copy)"
```

**Response:**
```json
{ "status": "success", "id": "ltx_video_t2v_1" }
```

**Errors:**
- `404`: Source workflow not found

## 5. Data Flow

### 5.1. Duplicate Workflow
```
Frontend: Click "Duplicate" on workflow row
    ↓ (POST /api/workflows/{id}/duplicate)
Backend: duplicate_workflow(id, new_name)
    ↓
  1. Load source JSON + config
  2. Generate unique new ID (stem_1, stem_2, ...)
  3. Copy workflow to {new_id}.json
  4. Copy config to {new_id}.config.json
  5. Update name field in new workflow
    ↓
Frontend: Refresh workflow list → new entry appears
```

### 5.2. Delete Workflow
```
Frontend: Click "Delete" → Confirm dialog
    ↓ (DELETE /api/workflows/{id})
Backend: delete_workflow(id)
    ↓
  1. Remove {id}.json
  2. Remove {id}.config.json
    ↓
Frontend: Refresh workflow list → entry removed
```

### 5.3. Rename Workflow
```
Frontend: Click "Rename" → Edit name → Save
    ↓ (PATCH /api/workflows/{id})
Backend: rename_workflow(id, new_name)
    ↓
  1. Load workflow JSON
  2. Update "name" field
  3. Save back to {id}.json (filename unchanged)
    ↓
Frontend: Refresh workflow list → name updated
```

## 6. Security & Safety

- **Path Traversal Prevention**: `workflow_id` is validated against `^[a-zA-Z0-9_-]+$` before filesystem access
- **Atomic Operations**: File copies use `shutil.copy2` for metadata preservation
- **Config Integrity**: Duplicate copies both `.json` and `.config.json`; delete removes both
- **Idempotent Import**: Import collision resolution ensures no data loss on repeated imports

## 7. Testing Strategy

- Integration tests via Starlette `TestClient`
- Test collision resolution: import same file 3 times → verify 3 unique IDs
- Test duplicate: verify config is copied correctly
- Test delete: verify both files removed, 404 on subsequent access
- Test rename: verify ID unchanged, name field updated
- Pyright strict mode compliance

## 8. Dependencies

- CR001: ComfyUI Foundation (workflow parser, routes, settings)
- CR003: ComfyUI Video Generation (uses workflow_id routing)

---

## 9. CR003 Session Changes (Video Generation Workflow Mapping Improvements)

The following improvements were made during CR003 development that impact the ComfyUI workflow management system:

### 9.1. Workflow ID Sanitization

**Problem**: Workflow files with spaces and special characters (e.g., `LTX 2.0 Distilled AIO v2.3 (params).json`) caused 400 Bad Request errors on delete because the backend validation regex only allowed `[a-zA-Z0-9_-]`.

**Solution** (`workflow_parser.py`):
- Sanitize workflow IDs during import by replacing invalid characters with underscores
- Automatic migration on startup renames existing files with invalid IDs
- `LTX 2.0 Distilled AIO v2.3 (params).json` → `LTX_2_0_Distilled_AIO_v2_3_params.json`

### 9.2. Delete Button Error Handling

**Problem**: The delete button silently failed when the backend returned an error (no feedback to user).

**Solution** (`ComfyUIWorkflowManager.tsx`):
- Display error message from backend when deletion fails
- Show generic failure message if backend doesn't provide details

### 9.3. Dropdown Search

**Problem**: Long workflow parameter lists were hard to navigate.

**Solution** (`ComfyUIMappingModal.tsx`):
- Added case-insensitive search input to all dropdowns
- Search matches against label, `node_title`, and `class_type`
- Auto-focuses on open, clears on close, Escape closes dropdown
- "No matching nodes" message when no results

### 9.4. Dropdown Display Format (class_type as Tag)

**Problem**: Node type tags were extracted heuristically from `node_title` (e.g., "CLIP Text Encode (Prompt)" → "CLIP Text Encode"), which was fragile and inconsistent.

**Solution**:
- Backend now includes `class_type` from the workflow JSON in `all_inputs` (e.g., `PrimitiveInt`, `LoadVideo`)
- Frontend displays `_meta.title` as the label (left side) and `class_type` as a colored tag (right side)
- Example: `Prompt` label + `PrimitiveString` tag

### 9.5. Video Generation Pipeline Fields

**Problem**: The AIO video workflow supports audio input but the mapping modal didn't expose it. Also added `negative_prompt` which both pipelines support.

**Solution** (`ComfyUIMappingModal.tsx`):
- Added `negative_prompt` to `image_gen` and `video_gen` pipelines
- Added `audio_path` to `video_gen` pipeline (optional — routed through `ComfyUIA2VPipeline` when audio is provided)
- `video_path` is intentionally excluded from `video_gen` — video-to-video is not yet supported by the backend pipelines

**Note on `video_path`**: The AIO workflow contains `LoadVideo` nodes, but neither `ComfyUIVideoPipeline` nor `ComfyUIA2VPipeline` implements video upload/patching logic. Adding `video_path` support requires backend changes to `video_pipeline.py`/`a2v_pipeline.py` (upload via ComfyUI client + patch workflow inputs).

### 9.6. Updated Pipeline Field Definitions

| Pipeline | Fields |
|----------|--------|
| **Image Generation** | prompt, negative_prompt, seed, width, height, num_inference_steps |
| **Video Generation** | prompt, negative_prompt, seed, width, height, num_frames, frame_rate, audio_path |
| **Video Retake** | video_path, mask_path, prompt, seed, start_time, end_time |
| **IC-LoRA** | prompt, seed, height, width, num_frames, frame_rate |

Required fields per pipeline remain unchanged. `audio_path` in `video_gen` is optional.
