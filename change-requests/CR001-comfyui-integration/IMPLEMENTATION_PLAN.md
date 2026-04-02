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

## Phase 3: Image Generation Pipeline (Generate Images)

**Goal:** Implement the adapter and ComfyUI workflow for Text-to-Image generation first, as it is the simplest pipeline and serves as a good baseline.

1.  **Workflow Creation:** Create and test the `image_generation.json` ComfyUI workflow with required `proxyWidgets` metadata (prompt, seed, dimensions, etc.).
2.  **Implement `ComfyUIImagePipeline`:**
    *   Create a class implementing the `ImageGenerationPipeline` protocol in `backend/services/comfyui/`.
    *   Implement graph construction: map UI parameters to the `image_generation.json` nodes.
3.  **Implement Progress Polling:** Set up the background task to poll the ComfyUI server for generation progress and translate it to `GenerationProgress` state.
4.  **Handler Routing Update:** Update `ImageGenerationHandler` to route requests to the ComfyUI pipeline when the backend is set to `"comfyui"`.
5.  **Validation:** 
    *   Test End-to-End image generation locally via API.
    *   Verify state transitions (`ComfyUIJobSlot` properly updates).

## Phase 4: Video Generation Pipelines (Generate Videos)

**Goal:** Implement adapters and workflows for Text-to-Video, Image-to-Video, and Audio-to-Video generation.

1.  **Workflow Creation:** Create `video_generation.json` and `a2v.json` workflows with `proxyWidgets` metadata.
2.  **Implement Adapters:**
    *   Create classes implementing `FastVideoPipeline` and `A2VPipeline` protocols.
    *   Handle base64 image data extraction and upload to ComfyUI for Image-to-Video conditioning.
3.  **Handler Routing Update:** Update `GenerationHandler` (for video) to appropriately route based on the selected generation backend.
4.  **Validation:**
    *   Test Image-to-Video and Audio-to-Video End-to-End via API.
    *   Verify generated media artifacts are properly fetched and saved locally.

## Phase 5: Advanced Video Editing Pipelines (Retake & IC-LoRA)

**Goal:** Implement the complex video editing and styled generation pipelines.

1.  **Workflow Creation:** Create `retake.json` and `ic_lora.json` workflows.
    *   `retake.json` needs to handle internal video masking, trimming based on start/end times, and blending.
    *   `ic_lora.json` needs to handle specific LoRA conditioning inputs.
2.  **Implement Adapters:** Create classes implementing `RetakePipeline` and `IcLoraPipeline` protocols.
3.  **Handler Routing Update:** Update `RetakeHandler` and `IcLoraHandler` routing logic.
4.  **Validation:**
    *   Test Retake inpainting functionality using a sample masked video.
    *   Test IC-LoRA generation using reference conditioning images.

## Phase 6: Handler Routing & Locking Overview

**Goal:** Ensure the centralized handler logic securely routes all tasks across all pipelines.

1.  **Cross-Handler Lock Safety:**
    *   Verify the "lock -> check -> unlock -> heavy work -> lock -> update" pattern is strictly followed across all handlers using the new `ComfyUIJobSlot`.
    *   Ensure proper error state handling to prevent deadlocks.

## Phase 7: Frontend Integration (Workflow Selection & Rendering)

**Goal:** Update the React frontend to natively support Model/Workflow selection and dynamic UI elements.

1.  **Model/Workflow Selection UI:** Add a dropdown/selector in each generation mode (Images, Videos, Retake) to pick between Local models and ComfyUI workflows.
2.  **Fetch Workflows:** Fetch available ComfyUI workflows and their metadata from the backend endpoint.
3.  **Dynamic Rendering:** 
    *   Parse the returned proxy widget schemas.
    *   Dynamically render sliders, dropdowns, and text inputs for the selected workflow.
4.  **Submission Logic:** Update frontend API calls (`backendFetch`) to pass `workflow_params` and the selected backend configuration.

## Phase 8: Testing and Validation

**Goal:** Ensure the entire integration is robust, user-friendly, and the local pipeline remains unaffected.

1.  **Backend Integration Tests:**
    *   Create comprehensive tests using fakes for the `ComfyUIClient` across all pipeline interfaces.
2.  **Type Checking:**
    *   Run `pnpm typecheck` to ensure the new dynamic parameter dictionaries haven't violated strict mode rules.
3.  **Local Regression:**
    *   Run existing `backend:test` suite to guarantee standard local generation is completely isolated and functional.