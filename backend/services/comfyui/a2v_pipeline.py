import copy
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from services.comfyui.comfyui_client import ComfyUIClient
from services.comfyui.workflow_parser import get_available_workflows, get_workflow

logger = logging.getLogger(__name__)

_DEBUG_DIR = Path(__file__).parent.parent.parent.parent / "debug_workflows"


def _debug_dump_workflow(workflow_id: str, api_workflow: dict[str, Any]) -> None:
    """Save patched api_workflow JSON to debug folder and log summary to console."""
    try:
        _DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = _DEBUG_DIR / f"{workflow_id}_{timestamp}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(api_workflow, f, indent=2)
        node_count = len(api_workflow)
        patched = sum(
            1 for nid, n in api_workflow.items()
            for v in n.get("inputs", {}).values()
            if not isinstance(v, list) or len(v) != 2
        )
        logger.info(
            f"[ComfyUI Debug] Patched workflow '{workflow_id}' → {filepath} "
            f"({node_count} nodes, {patched} inputs set)"
        )
    except Exception as e:
        logger.warning(f"Failed to dump debug workflow: {e}")


class ComfyUIA2VPipeline:
    """Adapts ComfyUI workflows for audio-to-video generation."""

    def __init__(self, workflow_id: str, comfyui_url: str, outputs_dir: Path):
        self.workflow_id = workflow_id
        self.client = ComfyUIClient(base_url=comfyui_url)
        self.outputs_dir = outputs_dir

    def generate(
        self,
        prompt: str,
        height: int,
        width: int,
        num_frames: int,
        frame_rate: float,
        num_inference_steps: int,
        seed: int,
        audio_path: str,
        guidance_scale: float = 8.0,
        negative_prompt: str = "",
        image_path: str | None = None,
        audio_start_time: float = 0.0,
        audio_max_duration: float | None = None,
        workflow_params: dict[str, Any] | None = None,
        progress_callback: Any | None = None,
        is_cancelled: Any | None = None,
    ) -> str:
        """Generate video from audio using ComfyUI workflow.
        
        Returns path to generated video file.
        """
        # 1. Resolve mappings
        all_workflows = get_available_workflows()
        wf_meta = next((w for w in all_workflows if w["id"] == self.workflow_id), None)
        if not wf_meta:
            raise RuntimeError(f"ComfyUI workflow '{self.workflow_id}' not found.")

        ui_mapping = wf_meta.get("ui_mapping", {})

        # 2. Load Graph JSON
        graph_data = get_workflow(self.workflow_id)
        if not graph_data:
            raise RuntimeError(f"Could not load workflow JSON for '{self.workflow_id}'.")

        # 3. Convert to API format
        api_workflow: dict[str, Any] = {}
        nodes = graph_data.get("nodes")

        def _normalize_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
            normalized = copy.deepcopy(inputs)
            for v in normalized.values():
                if isinstance(v, list) and len(v) == 2 and isinstance(v[0], (int, str)):  # type: ignore[arg-type]
                    v[0] = str(v[0])
            return normalized

        if isinstance(nodes, list):
            # Graph format
            for node in nodes:  # type: ignore[unknown-variable-type]
                if not isinstance(node, dict):
                    continue
                node_type: str = node.get("type", "")  # type: ignore[unknown-member-type]
                if node_type == "LTX_UI_Group":
                    continue
                node_id = str(node["id"])  # type: ignore[unknown-argument-type]
                api_workflow[node_id] = {
                    "class_type": node_type,
                    "inputs": _normalize_inputs(node.get("inputs", {}))  # type: ignore[unknown-argument-type,unknown-member-type]
                }
        else:
            # API format
            for node_id, node in graph_data.items():
                if not isinstance(node, dict):
                    continue
                node_type = node.get("class_type", "")  # type: ignore[unknown-member-type]
                if node_type == "LTX_UI_Group":
                    continue
                api_workflow[str(node_id)] = {
                    "class_type": node_type,
                    "inputs": _normalize_inputs(node.get("inputs", {}))  # type: ignore[unknown-argument-type,unknown-member-type]
                }

        # 4. Upload conditioning assets
        if image_path:
            if progress_callback:
                progress_callback("uploading_image", 10)
            uploaded_filename = self.client.upload_image(image_path)
            if "image_path" in ui_mapping:
                mapping = ui_mapping["image_path"]
                node_id = str(mapping["node"])
                field = mapping["field"]
                if node_id in api_workflow:
                    api_workflow[node_id]["inputs"][field] = uploaded_filename

        if audio_path:
            if progress_callback:
                progress_callback("uploading_audio", 15)
            uploaded_filename = self.client.upload_audio(audio_path)
            if "audio_path" in ui_mapping:
                mapping = ui_mapping["audio_path"]
                node_id = str(mapping["node"])
                field = mapping["field"]
                if node_id in api_workflow:
                    api_workflow[node_id]["inputs"][field] = uploaded_filename

        # 5. Patch workflow with parameters
        def set_input(ltx_key: str, value: Any) -> None:
            mapping = ui_mapping.get(ltx_key)
            if mapping:
                node_id = str(mapping["node"])
                field = mapping["field"]
                if node_id in api_workflow:
                    api_workflow[node_id]["inputs"][field] = value

        set_input("prompt", prompt)
        set_input("negative_prompt", negative_prompt)
        set_input("seed", seed)
        set_input("width", width)
        set_input("height", height)
        set_input("num_frames", num_frames)
        set_input("frame_rate", frame_rate)
        set_input("num_inference_steps", num_inference_steps)
        set_input("guidance_scale", guidance_scale)
        set_input("audio_start_time", audio_start_time)

        if workflow_params:
            for key, val in workflow_params.items():
                if key in ui_mapping:
                    set_input(key, val)

        # 6. Submit and Poll
        if progress_callback:
            progress_callback("inference", 20)

        # Debug: dump patched workflow before submission
        _debug_dump_workflow(self.workflow_id, api_workflow)

        prompt_res = self.client.prompt(api_workflow)
        prompt_id = prompt_res.get("prompt_id")
        if not prompt_id:
            raise RuntimeError("ComfyUI did not return a prompt_id")

        outputs: dict[str, Any] = {}
        import time
        while True:
            if is_cancelled and is_cancelled():
                raise RuntimeError("Generation was cancelled")

            history = self.client.get_history(prompt_id)
            if prompt_id in history:
                outputs = history[prompt_id].get("outputs", {})
                break
            time.sleep(1)

        # 7. Collect Results
        if progress_callback:
            progress_callback("downloading_output", 85)

        output_path = None
        import uuid
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        for _node_id, node_output in outputs.items():
            # Check for video outputs in order of priority:
            # 1. "gifs" - VHS_VideoCombine (VideoHelperSuite extension)
            # 2. "videos" - Some custom video nodes
            # 3. "images" with animated: [true] - Native ComfyUI video nodes (SaveVideo, SaveAnimatedWEBP)
            for output_key in ("gifs", "videos"):
                if output_key in node_output:
                    for vid_meta in node_output[output_key]:
                        video_bytes = self.client.view_video(
                            vid_meta["filename"],
                            vid_meta.get("subfolder", ""),
                            vid_meta.get("type", "")
                        )
                        output_path = self.outputs_dir / f"comfyui_a2v_{timestamp}_{uuid.uuid4().hex[:8]}.mp4"
                        output_path.write_bytes(video_bytes)
                        break  # Take first video
                    if output_path is not None:
                        break  # Found a video, stop searching

            # Check for animated images (native ComfyUI SaveVideo node uses "images" key)
            if output_path is None and "images" in node_output:
                is_animated = node_output.get("animated") == [True]
                if is_animated:
                    for img_meta in node_output["images"]:
                        video_bytes = self.client.view_video(
                            img_meta["filename"],
                            img_meta.get("subfolder", ""),
                            img_meta.get("type", "")
                        )
                        output_path = self.outputs_dir / f"comfyui_a2v_{timestamp}_{uuid.uuid4().hex[:8]}.mp4"
                        output_path.write_bytes(video_bytes)
                        break  # Take first video

            if output_path is not None:
                break  # Found a video, stop searching

        if output_path is None:
            raise RuntimeError("ComfyUI workflow did not produce a video output")

        return str(output_path)
