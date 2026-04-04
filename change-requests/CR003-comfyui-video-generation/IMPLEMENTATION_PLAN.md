# Implementation Plan: ComfyUI Video Generation

This plan documents the completed implementation of Phase 4 from CR001 (ComfyUI Integration), now extracted as a standalone change request.

## Phase 1: Backend Video Pipelines (COMPLETED)

**Goal:** Implement ComfyUI video pipeline services conforming to the video generation protocol.

### 1.1 ComfyUIVideoPipeline (COMPLETED)

**File:** `backend/services/comfyui/video_pipeline.py`

- Loads workflow JSON and `.config.json` mapping from `workflows/` directory
- Converts UI-format workflow graphs to API format (node list → API node map)
- Uploads conditioning images via `ComfyUIClient.upload_image()` and updates workflow references
- Patches workflow parameters using config mapping:
  - `prompt`, `seed`, `width`, `height`, `num_frames`, `frame_rate`
  - `num_inference_steps`, `guidance_scale`
  - Custom parameters via `workflow_params` dict
- Submits to ComfyUI server via `/prompt` endpoint
- Polls `/history` for completion with 1s intervals
- Downloads video output via `ComfyUIClient.view_video()`
- Saves to `outputs_dir` with timestamped filename: `comfyui_video_{timestamp}_{uuid}.mp4`
- Supports progress callbacks and cancellation checks

### 1.2 ComfyUIA2VPipeline (COMPLETED)

**File:** `backend/services/comfyui/a2v_pipeline.py`

- Extends video pipeline for audio-to-video workflows
- Uploads audio files via `ComfyUIClient.upload_audio()`
- Patches `audio_path` and `audio_start_time` in workflow
- Same execution flow as `ComfyUIVideoPipeline`

### 1.3 ComfyUIClient Extensions (COMPLETED)

**File:** `backend/services/comfyui/comfyui_client.py`

Added methods:

- `upload_audio(file_path: str) -> str`:
  - Uses ComfyUI's `/upload/image` endpoint (reused for all media types)
  - Builds multipart form data with `WebKitFormBoundary` delimiter
  - Returns uploaded filename

- `view_video(filename: str, subfolder: str, type: str) -> bytes`:
  - Downloads from `/view` endpoint with query params
  - Returns raw video bytes for saving

### 1.4 Sample Video Workflows (COMPLETED)

**Files:**
- `backend/services/comfyui/workflows/ltx_video_t2v.json` + `.config.json`
- `backend/services/comfyui/workflows/ltx_video_a2v.json` + `.config.json`

Text-to-video workflow:
- Node 1: `LTXVTextToVideo` with proxyWidgets for prompt, seed, dimensions, frames, steps, cfg
- Node 2: `VHS_VideoCombine` for output

Audio-to-video workflow:
- Node 1: `LTXVAudioToVideo` with additional audio_path and audio_start_time fields
- Node 2: `VHS_VideoCombine` for output

## Phase 2: Video Generation Handler Integration (COMPLETED)

**Goal:** Route video generation requests to ComfyUI pipelines when workflow_id is present.

### 2.1 VideoGenerationHandler Updates (COMPLETED)

**File:** `backend/handlers/video_generation_handler.py`

Added methods:

- `_generate_via_comfyui(req: GenerateVideoRequest) -> GenerateVideoResponse`:
  - Checks for existing generation (returns 409 if busy)
  - Generates unique generation_id
  - Computes num_frames from duration and fps
  - Resolves resolution for 16:9 or 9:16 aspect ratios (540p/720p/1080p)
  - Resolves seed
  - Detects A2V requests (has audio_path) and routes to `_generate_a2v_via_comfyui()`
  - Creates `ComfyUIVideoPipeline` with workflow_id, comfyui_url, outputs_dir
  - Manages generation state: start → progress updates → complete/fail
  - Handles cancellation: cleans up output file, returns "cancelled" status
  - Maps exceptions to HTTPError responses

- `_generate_a2v_via_comfyui(...) -> GenerateVideoResponse`:
  - Creates `ComfyUIA2VPipeline` with audio_path
  - Same state management and error handling as standard flow

Routing logic added to `generate()` method:
```python
if req.workflow_id:
    return self._generate_via_comfyui(req)
```

### 2.2 Image Pipeline Type Fixes (COMPLETED)

**File:** `backend/services/comfyui/image_pipeline.py`

Fixed type annotations to comply with pyright strict mode:
- Added explicit type hints for loop variables
- Renamed `ComfyUIOutput` to `ComfyUIImageOutput` for clarity
- Created proper PIL Image objects to satisfy Protocol requirements
- Updated cast to use correct output type

## Phase 3: Frontend Integration (COMPLETED)

**Goal:** No new frontend code required.

The existing Video tab already supports ComfyUI video workflows through:

1. **MODEL Dropdown**: Filters workflows by `pipeline === 'video_gen'` in config
2. **Generation Flow**: Sends `workflow_id` in request payload
3. **Backend Routing**: `VideoGenerationHandler` detects `workflow_id` and routes to ComfyUI

No frontend changes were needed for this phase.

## Phase 4: Validation (COMPLETED)

### 4.1 Backend Tests (COMPLETED)

- All 262 backend tests pass
- No mock usage violations
- Type checks pass with pyright strict mode

### 4.2 Manual Testing Checklist

- [x] Import T2V workflow, map parameters, generate video
- [x] Import A2V workflow, upload audio, generate video
- [x] Verify progress callbacks during generation
- [x] Test generation cancellation
- [x] Verify video saved to outputs directory
- [x] Test I2V flow with conditioning image upload
- [x] Verify resolution mapping for all aspect ratios

## Files Changed

| File | Lines | Description |
|------|-------|-------------|
| `backend/handlers/video_generation_handler.py` | +161 | ComfyUI routing and generation |
| `backend/services/comfyui/video_pipeline.py` | +177 | T2V/I2V pipeline adapter |
| `backend/services/comfyui/a2v_pipeline.py` | +193 | A2V pipeline adapter |
| `backend/services/comfyui/comfyui_client.py` | +76 | upload_audio + view_video methods |
| `backend/services/comfyui/image_pipeline.py` | ~32 | Type annotation fixes |
| `backend/services/comfyui/workflows/ltx_video_t2v.json` | +45 | Sample T2V workflow |
| `backend/services/comfyui/workflows/ltx_video_t2v.config.json` | +37 | T2V parameter mapping |
| `backend/services/comfyui/workflows/ltx_video_a2v.json` | +49 | Sample A2V workflow |
| `backend/services/comfyui/workflows/ltx_video_a2v.config.json` | +45 | A2V parameter mapping |
| `change-requests/CR001-comfyui-integration/IMPLEMENTATION_PLAN.md` | ~19 | Updated Phase 4 status |

**Total:** ~811 lines added, ~23 lines modified

## Dependencies

- CR001: ComfyUI Foundation (workflow parser, client base, settings, image pipeline)
- ComfyUI server with video-capable nodes

## Future Work

- Retake workflow support (Phase 5 of CR001)
- IC-LoRA workflow support (Phase 5 of CR001)
- Advanced parameter UI for workflow-specific controls
- Workflow validation and error reporting
