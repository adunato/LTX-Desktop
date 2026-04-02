# High-Level Design (HLD): ComfyUI Integration

## 1. Overview

This HLD specifies the integration of a ComfyUI engine into LTX-Desktop, utilizing the **Option B: Proxy-Based Metadata Mapping** architecture. The goal is to allow any standard ComfyUI workflow to drive the LTX-Desktop UI without requiring backend code changes or custom LTX-specific nodes.

The design adheres to the **Additive Isolation** principle, ensuring the native generation pipelines remain untouched while providing a backend-agnostic interface for external execution.

## 2. Core Components

### 2.1. API Types & State Management
*   **Request Routing**: `GenerateImageRequest` and `GenerateVideoRequest` are extended with an optional `workflow_id`. The presence of this ID dictates routing to the ComfyUI pipeline instead of the local GPU slot.
*   **`ComfyUIJobSlot`**: A new concurrency resource in `AppState` to track external job status, progress, and IDs. It is protected by the same global `RLock` as the `GpuSlot`, ensuring thread-safe status and progress tracking.

### 2.2. ComfyUI Service Module (`backend/services/comfyui/`)

1.  **`WorkflowParser`**: 
    *   Responsible for scanning, validating, and managing JSON workflows.
    *   **Mapping Discovery**: It introspects `node["properties"]["proxyWidgets"]` in the workflow JSON.
    *   **Configuration Persistence**: For each imported workflow, a corresponding `.config.json` file is stored, containing the resolved mappings and pipeline assignment.
2.  **`ComfyUIClient`**:
    *   Handles REST communication with ComfyUI (`/prompt`, `/upload/image`, `/history`, `/view`).
3.  **`ComfyUIPipelineAdapters`**:
    *   Concrete implementations of the pipeline Protocols (e.g., `ImageGenerationPipeline`).
    *   **Injection Logic**: Translates strictly-typed pipeline payloads into graph overrides. It patches the JSON: `workflow[target_node_id]["inputs"][target_widget_name] = value`.

### 2.3. Workflow Management & Configuration UI

A new tab called **"ComfyUI Workflows"** will be added to the Settings modal to allow users to manage their external workflows.

1.  **Workflow Import**: Users can import standard ComfyUI JSON files. Upon import, the workflow is saved to the internal `workflows/` directory.
2.  **Pipeline Assignment**: Users must assign each imported workflow to a specific generation pipeline (e.g., "Image Generation", "Video Generation").
3.  **Automapping Function**: Immediately after import or assignment, the system attempts to automap LTX required fields to the workflow's `proxyWidgets` based on name/label heuristics.
4.  **Status Indicator (LED)**: Next to each workflow in the list, a status LED indicates the mapping health:
    *   **Green**: All required fields for the assigned pipeline are successfully mapped.
    *   **Red**: One or more required fields are missing or incorrectly mapped.
5.  **Manual Mapping Modal**: A configuration icon next to the LED opens a modal for manual mapping overrides:
    *   **Left Pane**: List of LTX required fields for the assigned pipeline (e.g., Prompt, Seed, Width, Height).
    *   **Right Pane**: Dropdowns for each field, listing all available nodes and inputs discovered in the workflow JSON.
    *   **Persistence**: Saving these settings updates the workflow's `.config.json` file.

## 3. Supported Generation Use Cases (Functional Journeys)

To ensure full feature parity with the local backend, we map all existing generation capabilities to ComfyUI workflows using the `proxyWidgets` mapping.

### 3.1. Journey: Generate Videos

**Fast Video Generation (`video_generation.json`)**
Maps to the `FastVideoPipeline` interface.
*   **User Goal**: Create a new video clip from scratch, guided by text or starting from an initial image.
*   **Input Assets**: `images` (Optional list of initial/reference images).
*   **User Parameters**: `prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`.
*   **Technical Parameters (Handled in ComfyUI)**: VAE Encoding/Decoding, latent dimension calculations, noise scheduling.
*   **Output**: Saved video file (`output_path`).

**Audio-to-Video Generation (`a2v.json`)**
Maps to the `A2VPipeline` interface.
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

## 4. Operational Flow (Mapping-to-Execution)

1.  **Management**: User imports and configures a workflow via the **"ComfyUI Workflows"** tab. Mappings are stored in `.config.json`.
2.  **Registration**: Backend `/api/workflows` serves metadata (including mapping health) to the frontend.
3.  **Selection**: User selects a healthy workflow (Green LED) in the **"MODEL"** dropdown of a generation journey.
4.  **Routing**: `GenerationHandler` identifies `workflow_id` -> acquires `ComfyUIJobSlot` -> delegates to `ComfyUIPipelineAdapter`.
5.  **Asset Handling**: Adapter uploads any required assets (images/video/audio) to ComfyUI's `/input` and resolves filenames.
6.  **Injection**: Adapter patches the JSON using the persisted mappings: `workflow[node_id]["inputs"][field] = value`.
7.  **Execution**: `ComfyUIClient` submits the job; a polling task updates `AppState` with progress.
8.  **Finalization**: Media is fetched and saved locally.
