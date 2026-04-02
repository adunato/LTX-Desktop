# Implementation Plan: ComfyUI Integration

This plan outlines the steps required to implement the ComfyUI integration described in the High-Level Design (HLD), adhering to the principles of "Additive Isolation" to minimize fork impact.

## Phase 1: Foundation (API & State Types)

**Goal:** Extend core structures to support `workflow_id` routing.

1.  **Update API Types (COMPLETED):**
    *   In `backend/api_types.py`, add `workflow_id` to `GenerateImageRequest`, `GenerateVideoRequest`, `RetakeRequest`, and `IcLoraGenerateRequest`.
2.  **Update State Types (COMPLETED):**
    *   In `backend/state/app_state_types.py`, defined `ComfyUIJobSlot` and added it to `AppState`.

## Phase 2: Core ComfyUI Services (Metadata-Driven)

**Goal:** Create isolated services for workflow discovery and execution.

1.  **Implement `WorkflowParser` (IN PROGRESS):**
    *   Logic to scan `workflows/*.json`.
    *   Introspect `node["properties"]["proxyWidgets"]`.
    *   **New**: Add support for reading/writing `{workflow_id}.config.json` for persistent user mappings and pipeline assignments.
2.  **Implement `ComfyUIClient` (COMPLETED):**
    *   Wrapper for `/prompt`, `/upload/image`, `/history`, and `/view`.
3.  **Expose Endpoint (COMPLETED):**
    *   `GET /api/workflows` to return workflows and their mapping status.
4.  **New Management Endpoints**:
    *   `POST /api/workflows/import`: Save uploaded JSON to `workflows/` and trigger automapping.
    *   `POST /api/workflows/config`: Save user-defined mappings to `{id}.config.json`.

## Phase 3: Workflow Management & Image Generation Journey

**Goal:** Implement the complete end-to-end management UI and the first generation slice.

1.  **Frontend: Workflow Management Tab:**
    *   Add "ComfyUI Workflows" tab to `SettingsModal.tsx`.
    *   Implement Workflow list with Status LED (Green/Red) and Config icon.
    *   Implement "Import Workflow" (File picker -> Upload).
2.  **Frontend: Manual Mapping Modal:**
    *   Create `ComfyUIMappingModal.tsx`.
    *   Left column: Required LTX fields for the assigned pipeline.
    *   Right column: Dropdowns listing all available node inputs from the workflow.
3.  **Backend: Pipeline Adapter (Refactor):**
    *   Implement `ComfyUIImagePipeline`.
    *   Logic to patch graph JSON using the saved `.config.json` mappings.
4.  **Frontend: Unified Selection:**
    *   Integrate healthy (Green) ComfyUI workflows into the Image tab's MODEL dropdown.
5.  **Validation:**
    -   Import a workflow, assign to "Image Gen", perform manual mapping, verify LED turns green.
    -   Select workflow in MODEL dropdown and generate an image.

## Phase 4: Video Generation Journey (Vertical Slice)

**Goal:** Complete end-to-end Video Generation slice (T2V/I2V and A2V).

1.  **Backend: Video Adapters:**
    *   Implement `ComfyUIVideoPipeline` and `ComfyUIA2VPipeline`.
    *   Handle multipart asset uploads (image/audio) to ComfyUI.
2.  **Frontend: Video Journey:**
    *   Integrate into Video tab's MODEL dropdown.
3.  **Validation:**
    *   Generate a video and an audio-to-video clip.

## Phase 5: Advanced Editing Journeys (Retake & IC-LoRA Vertical Slice)

**Goal:** Complete slices for editing workflows.

1.  **Backend: Complex Mapping:**
    *   Implement `ComfyUIRetakePipeline` and `ComfyUIIcLoraPipeline`.
    *   Handle masking and conditioning image uploads.
2.  **Validation:**
    *   Perform a "Timeline Gap Fill" using a ComfyUI retake workflow.

## Phase 6: Final Polish & Safety

1.  **Thread Safety**: Verify global lock management for the `ComfyUIJobSlot`.
2.  **Global URL Configuration (COMPLETED)**: Added UI field for the ComfyUI Server Address.
3.  **Local Regression**: Run full backend test suite.
