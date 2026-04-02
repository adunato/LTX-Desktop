# High-Level Design (HLD): ComfyUI Integration

## 1. Overview

This High-Level Design details the integration of a ComfyUI engine into the LTX-Desktop application. As determined in the Impact Assessment, this integration follows **Option B: Proxy-Based Metadata Mapping**. 

The core architectural philosophy is **Additive Isolation**: the ComfyUI integration will be built *on top* of the existing local generation capabilities without modifying their underlying logic. This minimizes merge conflicts with the upstream fork and ensures the default native GPU experience is preserved.

## 2. Core Components

### 2.1. App Settings and API Types (Additive)

*   **`AppSettings`**: A new setting, `generation_backend` (Literal: `"local" | "comfyui"`), will be added to dictate the routing logic.
*   **`api_types.py`**: Generation request payloads (e.g., `VideoGenerationRequest`) will be extended with an optional `workflow_params: dict[str, Any] | None` to pass dynamic proxy widget values from the UI to the backend.

### 2.2. State Management (`AppState`)

To avoid disrupting the highly tuned local `GpuSlot` management:
*   A new state slot, **`ComfyUIJobSlot`**, will be introduced in `AppState`.
*   The centralized `AppHandler` lock will protect this new slot exactly as it protects the `GpuSlot`. 

### 2.3. ComfyUI Service Module

A new, isolated module (`backend/services/comfyui/`) will encapsulate all ComfyUI-specific logic:

1.  **`WorkflowParser`**: 
    *   Reads predefined ComfyUI JSON workflows.
    *   Extracts the `proxyWidgets` metadata to identify which internal node parameters are exposed to the UI.
2.  **`ComfyUIClient`**:
    *   Handles HTTP communication with the ComfyUI server (e.g., `/prompt`, `/upload/image`, `/history`).
    *   Manages WebSocket connections (if required) for real-time progress updates.
3.  **`ComfyUIPipelineAdapters`**:
    *   Implements the existing strictly-typed protocols (e.g., `FastVideoPipeline`).
    *   Translates the incoming `VideoGenerationRequest` (including `workflow_params`) into the final execution graph JSON.

### 2.4. Generation Handler Routing

The `GenerationHandler` will act as a router based on the `generation_backend` setting:

*   **If `"local"`**: The handler proceeds normally, acquiring the `GpuSlot` and delegating to the native `services.video_processor`.
*   **If `"comfyui"`**: The handler bypasses the `GpuSlot`, acquires the `ComfyUIJobSlot`, and delegates to the `ComfyUIPipelineAdapter`.

### 2.5. Progress Translation

To ensure the frontend requires zero changes to its progress tracking logic:
*   The `ComfyUIPipelineAdapter` will spawn a background polling task (using the existing `TaskRunner`).
*   This task will translate ComfyUI's native execution progress into the exact `GenerationProgress` (e.g., `GenerationRunning`, `GenerationComplete`) state objects expected by `AppState`.

## 3. Supported Generation Use Cases (Workflow Mapping)

To ensure the ComfyUI integration has full feature parity with the local backend, we must map all existing generation capabilities to corresponding ComfyUI JSON workflows. 
Rather than a direct 1:1 mapping of backend API payloads, workflows are designed functionally: separating user-facing parameters from the technical pipeline mechanics handled internally by ComfyUI.

Each workflow will need its own `proxyWidgets` metadata definition so the frontend can dynamically map user inputs to the specific ComfyUI nodes within that workflow graph.

### 3.1. Fast Video Generation (`video_generation.json`)
Maps to the `FastVideoPipeline` interface.
*   **User Goal**: Create a new video clip from scratch, guided by text or starting from an initial image.
*   **Input Assets**: `images` (Optional list of initial/reference images).
*   **User Parameters**: `prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`.
*   **Technical Parameters (Handled in ComfyUI)**: VAE Encoding/Decoding, latent dimension calculations, noise scheduling.
*   **Output**: Saved video file (`output_path`).

### 3.2. Image Generation (`image_generation.json`)
Maps to the `ImageGenerationPipeline` interface.
*   **User Goal**: Generate a single image from a text description.
*   **Input Assets**: None.
*   **User Parameters**: `prompt`, `seed`, `height`, `width`, `guidance_scale`.
*   **Technical Parameters (Handled in ComfyUI)**: VAE decoding, sampler configurations, `num_inference_steps`.
*   **Output**: Generated image array (`ImagePipelineOutputLike`).

### 3.3. Retake / Inpainting (`retake.json`)
Maps to the `RetakePipeline` interface.
*   **User Goal**: Fix a specific section of an existing video or fill a gap on the timeline.
*   **Input Assets**: `video_path` (Original video), internally generated mask data.
*   **User Parameters**: `prompt`, `negative_prompt`, `seed`, `start_time`, `end_time`, `enhance_prompt`, `regenerate_video`, `regenerate_audio`.
*   **Technical Parameters (Handled in ComfyUI)**: Video frame extraction, mask tensor generation, latent blending, multi-modal guider parameters, distillation flags, `num_inference_steps`.
*   **Output**: Modified video file (`output_path`).

### 3.4. IC-LoRA Generation (`ic_lora.json`)
Maps to the `IcLoraPipeline` interface.
*   **User Goal**: Generate video with strong adherence to character/style using Image-Conditioned LoRA.
*   **Input Assets**: `images` (Reference images for conditioning), `video_conditioning` (Timing/strength mapping).
*   **User Parameters**: `prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`.
*   **Technical Parameters (Handled in ComfyUI)**: LoRA loading, attention injection, prompt embedding overrides.
*   **Output**: Saved video file (`output_path`).

### 3.5. Audio-to-Video Generation (`a2v.json`)
Maps to the `A2VPipeline` interface.
*   **User Goal**: Generate a video driven by an audio track (e.g., lip-sync or audio-reactive visuals).
*   **Input Assets**: `audio_path`, `images` (Optional starting images).
*   **User Parameters**: `prompt`, `negative_prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`, `audio_start_time`, `audio_max_duration`.
*   **Technical Parameters (Handled in ComfyUI)**: Audio waveform processing, multi-modal alignment, `num_inference_steps`.
*   **Output**: Saved video file (`output_path`).

### 3.6. Depth Processor Pre-processing (`depth_process.json`)
Maps to the `DepthProcessorPipeline` interface.
*   **User Goal**: (Internal) Extract depth information from an image/frame for structural conditioning (ControlNet).
*   **Input Assets**: `frame` (Image data).
*   **User Parameters**: None (Triggered implicitly).
*   **Technical Parameters (Handled in ComfyUI)**: Depth model execution, tensor normalization.
*   **Output**: Processed depth map image data (`FrameArray`).

### 3.7. Pose Processor Pre-processing (`pose_process.json`)
Maps to the `PoseProcessorPipeline` interface.
*   **User Goal**: (Internal) Extract human pose skeletons from an image/frame for character conditioning (ControlNet).
*   **Input Assets**: `frame` (Image data).
*   **User Parameters**: None (Triggered implicitly).
*   **Technical Parameters (Handled in ComfyUI)**: Person detection model, pose estimation model execution.
*   **Output**: Processed pose map image data (`FrameArray`).

## 4. Architectural Flow (ComfyUI Active)

1.  **UI Configuration**: Frontend fetches available workflows via a new endpoint (parsed by `WorkflowParser`) and dynamically renders controls for the exposed `proxyWidgets`.
2.  **Submission**: User clicks generate. Frontend sends `VideoGenerationRequest` including `workflow_params`.
3.  **Routing**: `GenerationHandler` sees `generation_backend == "comfyui"`.
4.  **Locking**: Handler acquires lock -> sets `ComfyUIJobSlot` to running -> unlocks.
5.  **Execution**: `ComfyUIPipelineAdapter` constructs the final JSON graph and sends it to the `ComfyUIClient`.
6.  **Progress**: Background task polls ComfyUI, locking briefly to update `ComfyUIJobSlot` progress.
7.  **Completion**: Adapter retrieves the final media from ComfyUI, saves it locally, and updates state to `GenerationComplete`.
