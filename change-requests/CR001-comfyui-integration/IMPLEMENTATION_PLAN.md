# Implementation Plan: ComfyUI Integration

This plan outlines the steps required to implement the ComfyUI integration described in the High-Level Design (HLD), adhering to the principles of "Additive Isolation" to minimize fork impact.

## Phase 1: Foundation (Settings & API Types)

**Goal:** Extend the core data structures to support routing and dynamic payload parameters without breaking existing schemas.

1.  **Update Settings:**
    *   Modify `settings.json` and `backend/state/app_settings.py` to add `generation_backend` (defaulting to `"local"`).
2.  **Update API Types:**
    *   In `backend/api_types.py`, add `workflow_params: dict[str, Any] | None = None` to generation requests (e.g., `VideoGenerationRequest`).
3.  **Update State Types:**
    *   In `backend/state/app_state_types.py`, define a new `ComfyUIJobSlot` (tracking status, progress, current job ID).
    *   Add `comfyui_job: ComfyUIJobSlot | None` to the root `AppState` definition.

## Phase 2: Core ComfyUI Services

**Goal:** Create the isolated module (`backend/services/comfyui/`) for parsing workflows and communicating with the ComfyUI server.

1.  **Create Service Directory:** Initialize `backend/services/comfyui/`.
2.  **Implement `WorkflowParser`:**
    *   Create logic to read JSON workflows from a designated directory.
    *   Extract `proxyWidgets` metadata from node properties.
3.  **Implement `ComfyUIClient`:**
    *   Create an asynchronous HTTP client to communicate with the ComfyUI API (`/prompt`, `/upload/image`, `/history`, `/view`).
4.  **Expose Workflows Endpoint:**
    *   Create a new route in `backend/_routes/` (e.g., `workflows.py`) to expose the parsed workflows and their configurable parameters to the frontend.
    *   Wire the route into `app_factory.py`.

## Phase 3: Image Generation Journey (Vertical Slice)

**Goal:** Implement the complete end-to-end journey for Image Generation, from UI selection to ComfyUI execution.

1.  **Backend: Implementation (COMPLETED):**
    *   Create `image_generation.json` ComfyUI workflow.
    *   Implement `ComfyUIClient` and `WorkflowParser`.
    *   Update `ImageGenerationHandler` with `_generate_via_comfyui` routing and progress polling.
2.  **Frontend: Workflow Selection UI:**
    *   Update `frontend/views/GenerateImages.tsx` (or equivalent) to include a "Generation Backend" or "Model / Workflow" selector.
    *   Allow users to pick between "Local (Zit)" and available ComfyUI workflows (fetched from `GET /workflows`).
3.  **Frontend: Dynamic Parameter Rendering:**
    *   Implement a component to parse the `proxyWidgets` metadata from the selected ComfyUI workflow.
    *   Dynamically render UI fields (text, numbers, sliders) for these widgets.
4.  **Frontend: Submission Logic:**
    *   Update the `generateImage` call to pass the `workflow_params` dictionary populated by the dynamic UI.
5.  **Validation:**
    *   Select "ComfyUI" backend in the UI.
    *   Input a prompt and generate.
    *   Verify the progress bar updates and the final image appears in the UI.

## Phase 4: Video Generation Journey (Vertical Slice)

**Goal:** Implement the complete end-to-end journey for Video Generation (Text-to-Video and Audio-to-Video).

1.  **Backend: Video Adapters:**
    *   Create `video_generation.json` and `a2v.json` workflows.
    *   Update `GenerationHandler` to route Text-to-Video / Image-to-Video requests to ComfyUI.
    *   Implement `A2VPipeline` adapter for Audio-to-Video.
2.  **Frontend: Video Journey UI:**
    *   Update the Video Generation views to include the Workflow/Backend selector.
    *   Implement dynamic parameter rendering for video-specific widgets.
3.  **Validation:**
    *   Generate a video using ComfyUI and verify playback in the UI.
    *   Generate an Audio-to-Video clip using ComfyUI.

## Phase 5: Advanced Editing Journeys (Retake & IC-LoRA Vertical Slice)

**Goal:** Implement vertical slices for the most complex editing workflows.

1.  **Backend: Editing Adapters:**
    *   Create `retake.json` and `ic_lora.json` workflows.
    *   Implement `RetakePipeline` adapter: must handle masking and timing logic internally.
    *   Implement `IcLoraPipeline` adapter for styled conditioning.
2.  **Frontend: Editing Journey UI:**
    *   Update Retake and IC-LoRA views with the Workflow/Backend selector.
    *   Ensure dynamic parameters handle asset inputs (mask data, conditioning images).
3.  **Validation:**
    *   Perform a "Timeline Gap Fill" (Retake) using ComfyUI.
    *   Generate an IC-LoRA clip using ComfyUI.

## Phase 6: Final Polish & Safety

1.  **Cross-Handler Lock Safety:** Verify thread safety for the new `ComfyUIJobSlot` across all handlers.
2.  **Server Settings UI:** Add a UI field in Global Settings to configure the ComfyUI server URL (instead of hardcoded `127.0.0.1:8188`).
3.  **Local Regression:** Run full test suite to ensure the "local" mode remains 100% functional.