import copy
import logging
from pathlib import Path
from typing import Any

from services.comfyui.comfyui_client import ComfyUIClient
from services.comfyui.workflow_parser import get_available_workflows, get_workflow
from services.services_utils import ImagePipelineOutputLike

logger = logging.getLogger(__name__)

class ComfyUIImagePipeline:
    """Adapts standard ComfyUI workflows to the ImageGenerationPipeline protocol."""
    
    def __init__(self, workflow_id: str, comfyui_url: str, outputs_dir: Path):
        self.workflow_id = workflow_id
        self.client = ComfyUIClient(base_url=comfyui_url)
        self.outputs_dir = outputs_dir

    def generate(
        self,
        prompt: str,
        height: int,
        width: int,
        guidance_scale: float,
        num_inference_steps: int,
        seed: int,
        workflow_params: dict[str, Any] | None = None,
        progress_callback: Any | None = None,
        is_cancelled: Any | None = None
    ) -> ImagePipelineOutputLike:
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
            for k, v in normalized.items():
                if isinstance(v, list) and len(v) == 2 and isinstance(v[0], (int, str)):
                    v[0] = str(v[0])
            return normalized

        if isinstance(nodes, list):
            # Graph format
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                node_type = node.get("type", "")
                if node_type == "LTX_UI_Group":
                    continue
                node_id = str(node["id"])
                api_workflow[node_id] = {
                    "class_type": node_type,
                    "inputs": _normalize_inputs(node.get("inputs", {}))
                }
        else:
            # API format
            for node_id, node in graph_data.items():
                if not isinstance(node, dict):
                    continue
                node_type = node.get("class_type", "")
                if node_type == "LTX_UI_Group":
                    continue
                api_workflow[str(node_id)] = {
                    "class_type": node_type,
                    "inputs": _normalize_inputs(node.get("inputs", {}))
                }

        # 4. Patch Workflow
        def set_input(ltx_key: str, value: Any) -> None:
            mapping = ui_mapping.get(ltx_key)
            if mapping:
                node_id = str(mapping["node"])
                field = mapping["field"]
                if node_id in api_workflow:
                    api_workflow[node_id]["inputs"][field] = value

        set_input("prompt", prompt)
        set_input("seed", seed)
        set_input("width", width)
        set_input("height", height)
        set_input("num_inference_steps", num_inference_steps)
        set_input("guidance_scale", guidance_scale)

        if workflow_params:
            for key, val in workflow_params.items():
                if key in ui_mapping:
                    set_input(key, val)

        # 5. Submit and Poll
        if progress_callback:
            progress_callback("inference", 15)

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

        # 6. Collect Results
        if progress_callback:
            progress_callback("downloading_output", 85)

        output_paths: list[str] = []
        import uuid
        from datetime import datetime
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        for _node_id, node_output in outputs.items():
            if "images" in node_output:
                for img_meta in node_output["images"]:
                    image_bytes = self.client.view_image(img_meta["filename"], img_meta.get("subfolder", ""), img_meta.get("type", ""))
                    output_path = self.outputs_dir / f"comfyui_image_{timestamp}_{uuid.uuid4().hex[:8]}.png"
                    output_path.write_bytes(image_bytes)
                    output_paths.append(str(output_path))

        # Mock the Protocol return type
        class ComfyUIOutput:
            def __init__(self, paths):
                self.image_paths = paths
                # Protocol expects .images property which is a list of objects with .save() method
                # But here we already saved them. We'll return the paths for the handler to use.
                self.images = [] # Compatibility

        return cast(ImagePipelineOutputLike, ComfyUIOutput(output_paths))
