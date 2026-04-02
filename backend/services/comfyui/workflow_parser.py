import json
import logging
from pathlib import Path
from typing import Any, cast

logger = logging.getLogger(__name__)

WORKFLOWS_DIR = Path(__file__).parent / "workflows"

# Standard LTX UI Keys we want to map from ComfyUI proxyWidgets
STANDARD_LTX_KEYS = {
    "prompt": ["prompt", "positive", "positive_prompt", "text"],
    "negative_prompt": ["negative_prompt", "negative", "text_negative"],
    "seed": ["seed", "noise_seed"],
    "width": ["width", "image_width"],
    "height": ["height", "image_height"],
    "num_frames": ["num_frames", "frame_count"],
    "frame_rate": ["frame_rate", "fps"],
    "num_inference_steps": ["steps", "num_inference_steps", "iterations"],
    "guidance_scale": ["cfg", "guidance_scale"],
    "video_path": ["video", "input_video", "video_path"],
    "mask_path": ["mask", "input_mask", "mask_path"],
    "audio_path": ["audio", "input_audio", "audio_path"],
}

def _resolve_ltx_key(widget_name: Any) -> str | None:
    if not isinstance(widget_name, str):
        return None
    widget_name_lower = widget_name.lower()
    for ltx_key, aliases in STANDARD_LTX_KEYS.items():
        if widget_name_lower == ltx_key or widget_name_lower in aliases:
            return ltx_key
    return None

def get_available_workflows() -> list[dict[str, Any]]:
    workflows: list[dict[str, Any]] = []
    if not WORKFLOWS_DIR.exists():
        return workflows
        
    for file_path in WORKFLOWS_DIR.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data: dict[str, Any] = json.load(f)
            
            workflow_id = file_path.stem
            ui_mapping: dict[str, dict[str, str]] = {}
            
            # Introspect nodes for proxyWidgets (The Vlo Approach)
            nodes = data.get("nodes", [])
            if isinstance(nodes, list):
                for node in nodes:
                    if not isinstance(node, dict):
                        continue
                    properties = node.get("properties")
                    if not isinstance(properties, dict):
                        continue
                    proxy_widgets = properties.get("proxyWidgets")
                    if isinstance(proxy_widgets, list):
                        for proxy in proxy_widgets:
                            if isinstance(proxy, list) and len(proxy) >= 2:
                                # Cast to Any first then to expected types to force pyright to stop complaining
                                p_any: Any = proxy
                                target_node_id: str = str(p_any[0])
                                target_widget_name: str = str(p_any[1])
                                
                                # Try to match to standard LTX keys
                                ltx_key = _resolve_ltx_key(target_widget_name)
                                if ltx_key:
                                    ui_mapping[ltx_key] = {
                                        "node": target_node_id,
                                        "field": target_widget_name
                                    }

            if ui_mapping:
                workflows.append({
                    "id": workflow_id,
                    "name": str(data.get("name", workflow_id)),
                    "ui_mapping": ui_mapping
                })
            else:
                logger.warning(f"Workflow {workflow_id} has no valid ui_mapping via proxyWidgets")
                
        except Exception as e:
            logger.error(f"Failed to parse workflow {file_path}: {e}")
            
    return workflows

def get_workflow(workflow_id: str) -> dict[str, Any] | None:
    file_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not file_path.exists():
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return cast(dict[str, Any], json.load(f))
    except Exception:
        return None
