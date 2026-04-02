# High-Level Design (HLD): ComfyUI Integration

## 1. Overview

This HLD specifies the integration of a ComfyUI engine into LTX-Desktop, utilizing the **Option B: Proxy-Based Metadata Mapping** architecture. The goal is to allow any standard ComfyUI workflow to drive the LTX-Desktop UI without requiring backend code changes or custom LTX-specific nodes.

The design adheres to the **Additive Isolation** principle, ensuring the native generation pipelines remain untouched while providing a backend-agnostic interface for external execution.

## 2. Core Components

### 2.1. API Types & State Management
*   **Request Routing**: `GenerateImageRequest` and `GenerateVideoRequest` are extended with an optional `workflow_id`. The presence of this ID dictates routing to the ComfyUI pipeline instead of the local GPU slot.
*   **`ComfyUIJobSlot`**: A new concurrency resource in `AppState`. It is protected by the same global `RLock` as the `GpuSlot`, ensuring thread-safe status and progress tracking.

### 2.2. ComfyUI Service Module (`backend/services/comfyui/`)

1.  **`WorkflowParser`**: 
    *   Responsible for scanning and validating JSON workflows.
    *   **Mapping Discovery (Vlo Technique)**: It introspects `node["properties"]["proxyWidgets"]` in the workflow JSON. Each entry is a tuple `[target_node_id, target_widget_name]`.
    *   It build a map of **Standard LTX UI Keys** (e.g., `prompt`, `seed`, `width`, `height`, `num_frames`, `frame_rate`) to the internal `(target_node_id, target_widget_name)` based on the target widget's name or an associated label.
2.  **`ComfyUIClient`**:
    *   Handles REST communication with ComfyUI (`/prompt`, `/upload/image`, `/history`, `/view`).
3.  **`ComfyUIPipelineAdapters`**:
    *   Concrete implementations of the pipeline Protocols (e.g., `ImageGenerationPipeline`).
    *   **Injection Logic**: Translates strictly-typed pipeline payloads into graph overrides. It patches the JSON: `workflow[target_node_id]["inputs"][target_widget_name] = value`.

## 3. Supported Generation Use Cases (Functional Journeys)

To ensure full feature parity, we map all existing generation capabilities to ComfyUI workflows using the `proxyWidgets` mapping.

### 3.1. Journey: Generate Videos

**Fast Video Generation (`video_generation.json`)**
Maps to the `FastVideoPipeline` interface.
*   **User Goal**: Create a new video clip from scratch, guided by text or starting from an initial image.
*   **Input Assets**: `images` (Optional initial/reference image for I2V).
*   **User Parameters (Mapped via Proxies)**: `prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`.
*   **Technical Parameters (Internal to ComfyUI)**: Noise scheduling, sampler selection, VAE encoding/decoding.
*   **Output**: Saved video file (`output_path`).

**Audio-to-Video Generation (`a2v.json`)**
Maps to the `A2VPipeline` interface.
*   **User Goal**: Generate a video driven by an audio track (e.g., lip-sync or audio-reactive visuals).
*   **Input Assets**: `audio_path`, `images` (Optional starting images).
*   **User Parameters (Mapped via Proxies)**: `prompt`, `negative_prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`, `audio_start_time`.
*   **Technical Parameters (Internal to ComfyUI)**: Audio waveform analysis, multi-modal alignment.
*   **Output**: Saved video file (`output_path`).

### 3.2. Journey: Generate Images

**Image Generation (`image_generation.json`)**
Maps to the `ImageGenerationPipeline` interface.
*   **User Goal**: Generate a single image from a text description.
*   **Input Assets**: None.
*   **User Parameters (Mapped via Proxies)**: `prompt`, `seed`, `height`, `width`, `guidance_scale`, `num_inference_steps`.
*   **Technical Parameters (Internal to ComfyUI)**: Sampler configuration, VAE decoding.
*   **Output**: Generated image array (`ImagePipelineOutputLike`).

### 3.3. Journey: Retake

**Retake / Inpainting (`retake.json`)**
Maps to the `RetakePipeline` interface.
*   **User Goal**: Fix a specific section of an existing video or fill a gap on the timeline.
*   **Input Assets**: `video_path` (Original video), internally generated mask data.
*   **User Parameters (Mapped via Proxies)**: `prompt`, `negative_prompt`, `seed`, `start_time`, `end_time`, `enhance_prompt`.
*   **Technical Parameters (Internal to ComfyUI)**: Frame extraction, mask tensor generation, latent blending, multi-modal guider adherence.
*   **Output**: Modified video file (`output_path`).

### 3.4. Journey: IC-LORA

**IC-LoRA Generation (`ic_lora.json`)**
Maps to the `IcLoraPipeline` interface.
*   **User Goal**: Generate video with strong adherence to character/style using Image-Conditioned LoRA.
*   **Input Assets**: `images` (Reference images for conditioning), `video_conditioning` (Timing/strength mapping).
*   **User Parameters (Mapped via Proxies)**: `prompt`, `seed`, `height`, `width`, `num_frames`, `frame_rate`.
*   **Technical Parameters (Internal to ComfyUI)**: LoRA attention injection, prompt embedding overrides.
*   **Output**: Saved video file (`output_path`).

## 4. Operational Flow (Mapping-to-Execution)

1.  **Discovery**: `WorkflowParser` scans `workflows/*.json`. It introspects `node["properties"]["proxyWidgets"]` to identify valid journey workflows.
2.  **Registration**: Backend `/api/workflows` serves metadata to the frontend.
3.  **Selection**: User selects a workflow in the **"MODEL"** dropdown. UI remains fixed, using standard sliders.
4.  **Routing**: Handler identifies `workflow_id` -> acquires `ComfyUIJobSlot` -> delegates to `ComfyUIPipelineAdapter`.
5.  **Asset Handling**: Adapter uploads any required assets (images/video/audio) to ComfyUI's `/input` and resolves filenames.
6.  **Injection**: Adapter patches the JSON: `workflow[target_node_id]["inputs"][target_widget_name] = value`.
7.  **Execution**: `ComfyUIClient` submits the job; a polling task updates `AppState` with progress.
8.  **Finalization**: Media is fetched from ComfyUI and persisted in the local LTX-Desktop project library.
