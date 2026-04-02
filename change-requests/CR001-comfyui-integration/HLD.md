# High-Level Design (HLD): ComfyUI Integration

## 1. Overview

This High-Level Design details the integration of a ComfyUI engine into the LTX-Desktop application. As determined in the Impact Assessment, this integration follows **Option B: Proxy-Based Metadata Mapping**. 

The core architectural philosophy is **Additive Isolation**: the ComfyUI integration will be built *on top* of the existing local generation capabilities without modifying their underlying logic. This minimizes merge conflicts with the upstream fork and ensures the default native GPU experience is preserved.

## 2. Core Components

### 2.1. API Types (Additive)

*   **`api_types.py`**: Generation request payloads (e.g., `GenerateVideoRequest`) will be extended with an optional `workflow_id: str | None`. 
    *   If `workflow_id` is present, the backend routes to ComfyUI.
    *   If absent, the backend routes to local GPU models.

### 2.2. State Management (`AppState`)

To avoid disrupting the highly tuned local `GpuSlot` management:
*   A new state slot, **`ComfyUIJobSlot`**, will be introduced in `AppState`.
*   The centralized `AppHandler` lock will protect this new slot exactly as it protects the `GpuSlot`. 

### 2.3. ComfyUI Service Module

A new, isolated module (`backend/services/comfyui/`) will encapsulate all ComfyUI-specific logic:

1.  **`WorkflowParser`**: 
    *   Reads predefined ComfyUI JSON workflows.
    *   Extracts **Standard UI Mappings** from the workflow metadata. These mappings link fixed LTX-Desktop UI parameters (e.g., Prompt, Resolution, Seed) to specific nodes and fields in the ComfyUI graph.
2.  **`ComfyUIClient`**:
    *   Handles HTTP communication with the ComfyUI server (e.g., `/prompt`, `/upload/image`, `/history`).
3.  **`ComfyUIPipelineAdapters`**:
    *   Implements the existing strictly-typed protocols (e.g., `FastVideoPipeline`).
    *   Translates incoming UI parameters into the final execution graph JSON using the **Standard UI Mappings**.
    *   **Validation**: If a selected workflow is missing a required mapping for a UI parameter (e.g., no prompt node mapped), the adapter raises an explicit error.

### 2.4. Generation Handler Routing

The `GenerationHandler` will route requests based on the presence of a `workflow_id`:

*   **Native Models**: If `workflow_id` is null, the handler proceeds normally, acquiring the `GpuSlot`.
*   **ComfyUI Workflows**: If `workflow_id` is provided, the handler bypasses the `GpuSlot`, acquires the `ComfyUIJobSlot`, and delegates to the `ComfyUIPipelineAdapter`.

### 2.5. Progress Translation

To ensure the frontend requires zero changes to its progress tracking logic:
*   The `ComfyUIPipelineAdapter` will spawn a background polling task (using the existing `TaskRunner`).
*   This task will translate ComfyUI's native execution progress into the exact `GenerationProgress` (e.g., `GenerationRunning`, `GenerationComplete`) state objects expected by `AppState`.

### 2.6. Unified Model and Workflow Selection

The UI will provide a unified selector for each generation journey:
*   The **"MODEL"** dropdown will list both native LTX models (e.g., "Fast", "Pro") and available ComfyUI workflows.
*   **No Global Toggle**: ComfyUI workflows are treated as alternative "Models".
*   **Fixed UI Inputs**: Selecting a ComfyUI workflow does *not* change the UI layout. It uses the existing standard sliders and fields. The backend is responsible for mapping these standard fields to the ComfyUI graph via metadata.

## 3. Supported Generation Use Cases (Functional Journeys)

To ensure the ComfyUI integration has full feature parity with the local backend, we must map all existing generation capabilities to corresponding ComfyUI JSON workflows. 
Workflows are designed functionally, grouped by user journeys.

### Standard UI Mapping Metadata
Each workflow JSON must include a `ui_mapping` object in its metadata. This object maps LTX-Desktop UI parameters to ComfyUI nodes. 

Example mapping:
```json
"ui_mapping": {
  "prompt": { "node": "6", "field": "text" },
  "seed": { "node": "3", "field": "seed" },
  "width": { "node": "5", "field": "width" }
}
```

### 3.1. Journey: Generate Videos

**Fast Video Generation (`video_generation.json`)**
Maps to the `FastVideoPipeline` interface.
*   **User Goal**: Create a new video clip from scratch, guided by text or starting from an initial image.
*   **Input Assets**: `images` (Optional list of initial/reference images).
*   **User Parameters**: `prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`.
*   **Technical Parameters (Handled in ComfyUI)**: VAE Encoding/Decoding, latent dimension calculations, noise scheduling.
*   **Output**: Saved video file (`output_path`).

**Audio-to-Video Generation (`a2v.json`)**
Maps to the `a2v.json` workflow.
*   **User Goal**: Generate a video driven by an audio track (e.g., lip-sync or audio-reactive visuals).
*   **Input Assets**: `audio_path`, `images` (Optional starting images).
*   **User Parameters**: `prompt`, `negative_prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`, `audio_start_time`, `audio_max_duration`.
*   **Technical Parameters (Handled in ComfyUI)**: Audio waveform processing, multi-modal alignment, `num_inference_steps`.
*   **Output**: Saved video file (`output_path`).

### 3.2. Journey: Generate Images

**Image Generation (`image_generation.json`)**
Maps to the `ImageGenerationPipeline` interface.
*   **User Goal**: Generate a single image from a text description.
*   **Input Assets**: None.
*   **User Parameters**: `prompt`, `seed`, `height`, `width`, `guidance_scale`.
*   **Technical Parameters (Handled in ComfyUI)**: VAE decoding, sampler configurations, `num_inference_steps`.
*   **Output**: Generated image array (`ImagePipelineOutputLike`).

### 3.3. Journey: Retake

**Retake / Inpainting (`retake.json`)**
Maps to the `RetakePipeline` interface.
*   **User Goal**: Fix a specific section of an existing video or fill a gap on the timeline.
*   **Input Assets**: `video_path` (Original video), internally generated mask data.
*   **User Parameters**: `prompt`, `negative_prompt`, `seed`, `start_time`, `end_time`, `enhance_prompt`, `regenerate_video`, `regenerate_audio`.
*   **Technical Parameters (Handled in ComfyUI)**: Video frame extraction, mask tensor generation, latent blending, multi-modal guider parameters, distillation flags, `num_inference_steps`.
*   **Output**: Modified video file (`output_path`).

### 3.4. Journey: IC-LORA

**IC-LoRA Generation (`ic_lora.json`)**
Maps to the `IcLoraPipeline` interface.
*   **User Goal**: Generate video with strong adherence to character/style using Image-Conditioned LoRA.
*   **Input Assets**: `images` (Reference images for conditioning), `video_conditioning` (Timing/strength mapping).
*   **User Parameters**: `prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`.
*   **Technical Parameters (Handled in ComfyUI)**: LoRA loading, attention injection, prompt embedding overrides.
*   **Output**: Saved video file (`output_path`).

### 3.5. Internal Pre-processing

**Depth Processor Pre-processing (`depth_process.json`)**
Maps to the `DepthProcessorPipeline` interface.
*   **User Goal**: (Internal) Extract depth information from an image/frame for structural conditioning (ControlNet).
*   **Input Assets**: `frame` (Image data).
*   **User Parameters**: None (Triggered implicitly).
*   **Technical Parameters (Handled in ComfyUI)**: Depth model execution, tensor normalization.
*   **Output**: Processed depth map image data (`FrameArray`).

**Pose Processor Pre-processing (`pose_process.json`)**
Maps to the `PoseProcessorPipeline` interface.
*   **User Goal**: (Internal) Extract human pose skeletons from an image/frame for character conditioning (ControlNet).
*   **Input Assets**: `frame` (Image data).
*   **User Parameters**: None (Triggered implicitly).
*   **Technical Parameters (Handled in ComfyUI)**: Person detection model, pose estimation model execution.
*   **Output**: Processed pose map image data (`FrameArray`).

## 4. Architectural Flow (ComfyUI Workflow Selected)

1.  **Workflow Fetching**: Frontend fetches available workflows via `/api/workflows` (parsed by `WorkflowParser`).
2.  **Selection**: User selects a workflow from the **"MODEL"** dropdown.
3.  **Submission**: User clicks generate. Frontend sends the request including the `workflow_id`.
4.  **Routing**: `GenerationHandler` sees a non-null `workflow_id` and routes to ComfyUI.
5.  **Locking**: Handler acquires lock -> sets `ComfyUIJobSlot` to running -> unlocks.
6.  **Execution**: `ComfyUIPipelineAdapter` uses the `ui_mapping` metadata to inject UI parameters into the JSON graph and sends it to the `ComfyUIClient`.
7.  **Progress**: Background task polls ComfyUI, locking briefly to update `ComfyUIJobSlot` progress.
8.  **Completion**: Adapter retrieves the final media from ComfyUI, saves it locally, and updates state to `GenerationComplete`.
