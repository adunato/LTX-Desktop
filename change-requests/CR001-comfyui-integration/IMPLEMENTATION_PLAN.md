# Implementation Plan: ComfyUI Integration

This plan outlines the steps required to implement the ComfyUI integration described in the High-Level Design (HLD), adhering to the principles of "Additive Isolation" to minimize fork impact.

## Phase 1: Foundation (API & State Types)

**Goal:** Extend the core data structures to support routing via `workflow_id` without breaking existing schemas.

1.  **Update API Types:**
    *   In `backend/api_types.py`, add `workflow_id: str | None = None` to generation requests (e.g., `GenerateImageRequest`, `GenerateVideoRequest`).
    *   (Optional) Keep `workflow_params` for future-proofing or advanced overrides.
2.  **Update State Types:**
    *   In `backend/state/app_state_types.py`, define a new `ComfyUIJobSlot` (tracking status, progress, current job ID).
    *   Add `comfyui_job: ComfyUIJobSlot | None` to the root `AppState` definition.

## Phase 2: Core ComfyUI Services (Metadata-Driven)

**Goal:** Create the isolated module (`backend/services/comfyui/`) for parsing workflows and communicating with the ComfyUI server.

1.  **Implement `WorkflowParser`:**
    *   Create logic to read JSON workflows from `backend/services/comfyui/workflows/`.
    *   Extract `ui_mapping` metadata from the workflow JSON. This mapping defines which UI fields (e.g., `prompt`, `seed`, `width`) map to which ComfyUI node/field.
2.  **Implement `ComfyUIClient`:**
    *   Handle HTTP communication with ComfyUI API (`/prompt`, `/history`, `/view`).
3.  **Expose Workflows Endpoint:**
    *   Expose `GET /api/workflows` to the frontend so the MODEL dropdown can be populated.

## Phase 3: Image Generation Journey (Vertical Slice)

**Goal:** Implement the complete end-to-end journey for Image Generation using unified model selection and UI-to-Graph mapping.

1.  **Backend: Metadata Injection:**
    *   Update `ImageGenerationHandler._generate_via_comfyui`.
    *   Instead of hardcoded node IDs, use the `ui_mapping` from the workflow JSON to inject UI values (Prompt, Seed, Dimensions) into the graph.
    *   **Validation**: Add logic to raise a clear error if a required UI field (e.g., "prompt") isn't mapped in the selected workflow.
2.  **Frontend: Unified Model Dropdown:**
    *   Update the MODEL selector in the Image Generation tab.
    *   Merge available ComfyUI workflows into the dropdown list alongside the native "Z-Image Turbo".
    *   Remove the "Generation Backend" toggle from global settings.
3.  **Frontend: Submission Logic:**
    *   Update `handleGenerate` to pass the `workflow_id` when a ComfyUI "model" is selected.
4.  **Validation:**
    -   Select a ComfyUI workflow from the MODEL dropdown.
    -   Generate an image using the standard UI inputs.
    -   Verify that missing mappings in a JSON file result in a graceful error message in the UI.

## Phase 4: Video Generation Journey (Vertical Slice)

**Goal:** Implement end-to-end Video Generation (Text-to-Video and Audio-to-Video).

1.  **Backend: Video UI Mappings:**
    *   Create `video_generation.json` and `a2v.json` with appropriate `ui_mapping` metadata.
    *   Update `GenerationHandler` to route based on `workflow_id`.
2.  **Frontend: Video Journey UI:**
    *   Integrate ComfyUI workflows into the Video tab's MODEL dropdown.
    *   Ensure standard parameters (Duration, Resolution, FPS) map correctly via metadata.
3.  **Validation:**
    *   Generate a Text-to-Video clip and verify playback.
    *   Generate an Audio-to-Video clip using the standard audio uploader.

## Phase 5: Advanced Editing Journeys (Retake & IC-LoRA Vertical Slice)

**Goal:** Implement vertical slices for Retake and IC-LoRA.

1.  **Backend: Complex Mappings:**
    *   Create `retake.json` and `ic_lora.json`.
    *   Mappings must handle assets (e.g., `ui_video_path`, `ui_mask_data`, `ui_conditioning_image`).
2.  **Frontend: Editing Journey UI:**
    *   Integrate workflows into Retake and IC-LoRA MODEL selectors.
3.  **Validation:**
    *   Perform a "Timeline Gap Fill" using a ComfyUI retake workflow.

## Phase 6: Final Polish & Safety

1.  **Cross-Handler Lock Safety:** Verify thread safety for the new `ComfyUIJobSlot`.
2.  **Server URL Configuration:** Add a UI field in Global Settings specifically for the "ComfyUI Server Address".
3.  **Local Regression:** Run full test suite to ensure the "local" mode remains unaffected.
