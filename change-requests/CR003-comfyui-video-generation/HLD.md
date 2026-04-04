# High-Level Design: ComfyUI Video Generation

## Overview

This change request implements end-to-end video generation support for ComfyUI workflows in LTX Desktop. It extends the existing ComfyUI integration (CR001) to handle text-to-video (T2V), image-to-video (I2V), and audio-to-video (A2V) generation journeys using external ComfyUI servers.

## Problem Statement

The initial ComfyUI integration (CR001) established the foundation for workflow management and image generation. However, video generation — a core use case for LTX models — was not yet supported. Users need to:

1. Import ComfyUI video workflows (T2V, I2V, A2V)
2. Map workflow parameters to LTX's video generation API
3. Execute video generation with progress tracking
4. Retrieve and display the generated video

## Design Principles

- **Additive Isolation**: All new code lives alongside existing CR001 code; no modifications to core image generation or workflow management logic
- **Vertical Slice**: Complete end-to-end flow from API request to video output
- **Protocol Compatibility**: Video pipelines conform to the same `VideoPipeline` protocol as native LTX video generation

## Architecture

### Backend Components

#### 1. `ComfyUIVideoPipeline` (`backend/services/comfyui/video_pipeline.py`)

Adapts ComfyUI workflows to the video generation protocol:

- Loads workflow JSON and `.config.json` mapping
- Converts UI-format workflow to API format
- Uploads conditioning images via `ComfyUIClient.upload_image()`
- Patches workflow parameters (prompt, seed, dimensions, frames, etc.)
- Submits to ComfyUI server and polls for completion
- Downloads resulting video via `ComfyUIClient.view_video()`

#### 2. `ComfyUIA2VPipeline` (`backend/services/comfyui/a2v_pipeline.py`)

Extends `ComfyUIVideoPipeline` for audio-to-video generation:

- Uploads audio files via `ComfyUIClient.upload_audio()`
- Patches `audio_path` and `audio_start_time` fields in workflow
- Same execution flow as standard video pipeline

#### 3. `ComfyUIClient` Extensions (`backend/services/comfyui/comfyui_client.py`)

New methods added:

- `upload_audio(file_path: str) -> str`: Uploads audio files to ComfyUI's `/upload/image` endpoint (ComfyUI reuses this for all media)
- `view_video(filename: str, subfolder: str, type: str) -> bytes`: Downloads video files from ComfyUI's `/view` endpoint

#### 4. `VideoGenerationHandler` Updates (`backend/handlers/video_generation_handler.py`)

- Added `_generate_via_comfyui(req: GenerateVideoRequest)` method
- Added `_generate_a2v_via_comfyui(...)` method for A2V requests
- Routing logic: checks `req.workflow_id` to determine ComfyUI vs native generation
- Resolution mapping for 16:9 and 9:16 aspect ratios at 540p/720p/1080p
- Progress callbacks mapped to ComfyUI execution phases
- Cancellation support via `is_cancelled` callback

### Workflow Files

Sample workflows shipped with the implementation:

- `ltx_video_t2v.json` + `ltx_video_t2v.config.json`: Text-to-video example
- `ltx_video_a2v.json` + `ltx_video_a2v.config.json`: Audio-to-video example

### Frontend Integration

No new frontend code required. The existing Video tab's MODEL dropdown already filters by `pipeline === 'video_gen'`, which matches the ComfyUI video workflow config. The routing happens entirely in the backend handler.

## Data Flow

```
Frontend Video Tab
    ↓ (POST /api/video/generate with workflow_id)
VideoGenerationHandler.generate()
    ↓ (detects workflow_id)
_generate_via_comfyui()
    ↓
ComfyUIVideoPipeline.generate()
    ↓
  1. Load workflow + config
  2. Convert to API format
  3. Upload image (if I2V)
  4. Patch parameters
  5. Submit to ComfyUI (/prompt)
  6. Poll history (/history)
  7. Download video (/view)
    ↓
Save to outputs_dir → Return path
```

## Security & Safety

- **Thread Safety**: Uses existing `AppState` lock pattern (lock→read→unlock→work→lock→write)
- **Cancellation**: Supports generation cancellation via callback
- **Error Handling**: Maps ComfyUI errors to HTTPError responses; cancellation returns clean state

## Testing Strategy

- Integration tests via Starlette `TestClient` with fake ComfyUI services
- No mocks: use protocol-compatible fake implementations
- Validate workflow loading, parameter patching, and response formatting
- Pyright strict mode compliance

## Dependencies

- CR001 (ComfyUI Foundation): Workflow parser, client base, image pipeline, settings
- ComfyUI server with video-capable nodes (e.g., LTXVTextToVideo, VHS_VideoCombine)
