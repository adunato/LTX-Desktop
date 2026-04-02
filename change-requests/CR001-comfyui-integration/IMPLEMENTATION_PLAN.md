# Implementation Plan: ComfyUI Integration

This plan outlines the steps required to implement the ComfyUI integration described in the High-Level Design (HLD), adhering to the principles of "Additive Isolation" to minimize fork impact.

## Phase 1: Foundation (API & State Types)

**Goal:** Extend core structures to support `workflow_id` routing.

1.  **Update API Types:**
    *   In `backend/api_types.py`, add `workflow_id: str | None = None` to `GenerateImageRequest`, `GenerateVideoRequest`, `RetakeRequest`, and `IcLoraGenerateRequest`.
2.  **Update State Types:**
    *   In `backend/state/app_state_types.py`, define `ComfyUIJobSlot` and add it to `AppState`.

## Phase 2: Core ComfyUI Services (Metadata-Driven)

**Goal:** Create isolated services for workflow discovery and execution.

1.  **Implement `WorkflowParser`:**
    *   Logic to scan `workflows/*.json`.
    *   Introspect `node["properties"]["proxyWidgets"]` to build a map of standard UI keys to graph nodes.
    *   Use ComfyUI `/object_info` (cached) to validate node types.
2.  **Implement `ComfyUIClient`:**
    *   Wrapper for `/prompt`, `/upload/image`, `/history`, and `/view`.
3.  **Expose Endpoint:**
    *   `GET /api/workflows` to return valid workflows and their identified parameters.

## Phase 3: Image Generation Journey (Vertical Slice)

**Goal:** Complete end-to-end Image Generation slice.

1.  **Backend: Pipeline Adapter:**
    *   Implement `ComfyUIImagePipeline` (adapting `ImageGenerationPipeline` protocol).
    *   Inject UI parameters into the graph using the discovered `proxyWidgets`.
2.  **Frontend: Unified Selection:**
    *   Integrate ComfyUI workflows into the Image tab's MODEL dropdown.
    *   Map standard UI inputs (Prompt, Seed, etc.) to the selected workflow.
3.  **Validation:**
    -   Select a workflow, generate an image, and verify the result in the gallery.

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
2.  **Global URL Configuration**: Add UI field for the ComfyUI Server Address.
3.  **Local Regression**: Run full backend test suite.
