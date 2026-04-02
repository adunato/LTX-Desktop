"""Image generation orchestration handler."""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import TYPE_CHECKING, Any

from _routes._errors import HTTPError
from api_types import GenerateImageRequest, GenerateImageResponse
from handlers.base import StateHandlerBase
from handlers.generation_handler import GenerationHandler
from handlers.pipelines_handler import PipelinesHandler
from services.interfaces import ZitAPIClient
from state.app_state_types import AppState

if TYPE_CHECKING:
    from runtime_config.runtime_config import RuntimeConfig

logger = logging.getLogger(__name__)


class ImageGenerationHandler(StateHandlerBase):
    def __init__(
        self,
        state: AppState,
        lock: RLock,
        generation_handler: GenerationHandler,
        pipelines_handler: PipelinesHandler,
        config: RuntimeConfig,
        zit_api_client: ZitAPIClient,
    ) -> None:
        super().__init__(state, lock, config)
        self._generation = generation_handler
        self._pipelines = pipelines_handler
        self._zit_api_client = zit_api_client

    def generate(self, req: GenerateImageRequest) -> GenerateImageResponse:
        if self._generation.is_generation_running():
            raise HTTPError(409, "Generation already in progress")

        width = (req.width // 16) * 16
        height = (req.height // 16) * 16
        num_images = max(1, min(12, req.numImages))

        generation_id = uuid.uuid4().hex[:8]
        settings = self.state.app_settings.model_copy(deep=True)
        if settings.seed_locked:
            seed = settings.locked_seed
            logger.info("Using locked seed for image: %s", seed)
        else:
            seed = int(time.time()) % 2147483647

        if req.workflow_id:
            return self._generate_via_comfyui(
                workflow_id=req.workflow_id,
                prompt=req.prompt,
                width=width,
                height=height,
                num_inference_steps=req.numSteps,
                seed=seed,
                num_images=num_images,
                workflow_params=req.workflow_params,
            )

        if self.config.force_api_generations:
            return self._generate_via_api(
                prompt=req.prompt,
                width=width,
                height=height,
                num_inference_steps=req.numSteps,
                seed=seed,
                num_images=num_images,
            )

        try:
            self._pipelines.load_zit_to_gpu()
            self._generation.start_generation(generation_id)
            output_paths = self.generate_image(
                prompt=req.prompt,
                width=width,
                height=height,
                num_inference_steps=req.numSteps,
                seed=seed,
                num_images=num_images,
            )
            self._generation.complete_generation(output_paths)
            return GenerateImageResponse(status="complete", image_paths=output_paths)
        except Exception as e:
            self._generation.fail_generation(str(e))
            if "cancelled" in str(e).lower():
                logger.info("Image generation cancelled by user")
                return GenerateImageResponse(status="cancelled")
            raise HTTPError(500, str(e)) from e

    def generate_image(
        self,
        prompt: str,
        width: int,
        height: int,
        num_inference_steps: int,
        seed: int | None,
        num_images: int,
    ) -> list[str]:
        if self._generation.is_generation_cancelled():
            raise RuntimeError("Generation was cancelled")

        self._generation.update_progress("loading_model", 5, 0, num_inference_steps)
        zit = self._pipelines.load_zit_to_gpu()
        self._generation.update_progress("inference", 15, 0, num_inference_steps)

        if seed is None:
            seed = int(time.time()) % 2147483647

        outputs: list[str] = []
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        for i in range(num_images):
            if self._generation.is_generation_cancelled():
                raise RuntimeError("Generation was cancelled")

            progress = 15 + int((i / num_images) * 80)
            self._generation.update_progress("inference", progress, i, num_images)

            result = zit.generate(
                prompt=prompt,
                height=height,
                width=width,
                guidance_scale=0.0,
                num_inference_steps=num_inference_steps,
                seed=seed + i,
            )

            output_path = self.config.outputs_dir / f"zit_image_{timestamp}_{uuid.uuid4().hex[:8]}.png"
            result.images[0].save(str(output_path))
            outputs.append(str(output_path))

        if self._generation.is_generation_cancelled():
            raise RuntimeError("Generation was cancelled")

        self._generation.update_progress("complete", 100, num_images, num_images)
        return outputs

    def _generate_via_api(
        self,
        *,
        prompt: str,
        width: int,
        height: int,
        num_inference_steps: int,
        seed: int,
        num_images: int,
    ) -> GenerateImageResponse:
        output_paths: list[str] = []
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        generation_id = uuid.uuid4().hex[:8]
        settings = self.state.app_settings

        if not settings.fal_api_key.strip():
            raise HTTPError(500, "FAL_API_KEY_NOT_CONFIGURED")

        try:
            self._generation.start_api_generation(generation_id)
            self._generation.update_progress("validating_request", 5, 0, num_images)

            for i in range(num_images):
                if self._generation.is_generation_cancelled():
                    raise RuntimeError("Generation was cancelled")

                self._generation.update_progress("inference", 15 + int((i / num_images) * 80), i, num_images)
                
                # Call Zit API (FAL)
                image_bytes = self._zit_api_client.generate_text_to_image(
                    api_key=settings.fal_api_key,
                    prompt=prompt,
                    width=width,
                    height=height,
                    seed=seed + i,
                    num_inference_steps=num_inference_steps,
                )

                output_path = self.config.outputs_dir / f"api_image_{timestamp}_{uuid.uuid4().hex[:8]}.png"
                output_path.write_bytes(image_bytes)
                output_paths.append(str(output_path))

            self._generation.update_progress("complete", 100, num_images, num_images)
            self._generation.complete_generation(output_paths)
            return GenerateImageResponse(status="complete", image_paths=output_paths)
        except HTTPError:
            raise
        except Exception as e:
            self._generation.fail_generation(str(e))
            if "cancelled" in str(e).lower():
                for path in output_paths:
                    Path(path).unlink(missing_ok=True)
                logger.info("Image generation cancelled by user")
                return GenerateImageResponse(status="cancelled")
            raise HTTPError(500, str(e)) from e

    def _generate_via_comfyui(
        self,
        *,
        workflow_id: str,
        prompt: str,
        width: int,
        height: int,
        num_inference_steps: int,
        seed: int,
        num_images: int,
        workflow_params: dict[str, Any] | None,
    ) -> GenerateImageResponse:
        from services.comfyui.comfyui_client import ComfyUIClient
        from services.comfyui.workflow_parser import get_workflow
        import copy

        generation_id = uuid.uuid4().hex[:8]
        output_paths: list[Path] = []
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        client = ComfyUIClient()

        try:
            self._generation.start_api_generation(generation_id)
            self._generation.update_progress("validating_request", 5, None, None)
            
            base_workflow = get_workflow(workflow_id)
            if not base_workflow:
                raise HTTPError(404, f"ComfyUI workflow '{workflow_id}' not found.")

            ui_mapping = base_workflow.get("ui_mapping", {})
            required_fields = ["prompt", "seed", "width", "height", "num_inference_steps"]
            for field in required_fields:
                if field not in ui_mapping:
                    raise HTTPError(400, f"Workflow '{workflow_id}' is missing required UI mapping: {field}")

            for idx in range(num_images):
                if self._generation.is_generation_cancelled():
                    raise RuntimeError("Generation was cancelled")

                workflow = copy.deepcopy(base_workflow)
                # Cleanup metadata before submission
                workflow.pop("ui_mapping", None)
                workflow.pop("proxyWidgets", None)
                
                try:
                    def set_input(map_key: str, value: Any) -> None:
                        mapping = ui_mapping[map_key]
                        workflow[mapping["node"]]["inputs"][mapping["field"]] = value

                    set_input("prompt", prompt)
                    set_input("seed", seed + idx)
                    set_input("width", width)
                    set_input("height", height)
                    set_input("num_inference_steps", num_inference_steps)
                    
                    # Apply optional overrides from workflow_params if present
                    if workflow_params:
                        for key, val in workflow_params.items():
                            if key in ui_mapping:
                                set_input(key, val)

                except KeyError as e:
                    raise HTTPError(500, f"Invalid UI mapping in workflow JSON: {e}")

                self._generation.update_progress("inference", 15 + int((idx / num_images) * 60), None, None)
                prompt_res = client.prompt(workflow)
                prompt_id = prompt_res.get("prompt_id")
                if not prompt_id:
                    raise RuntimeError("ComfyUI did not return a prompt_id")
                
                outputs: dict[str, Any] = {}
                while True:
                    if self._generation.is_generation_cancelled():
                        # TODO: Call ComfyUI cancel API
                        raise RuntimeError("Generation was cancelled")
                    history = client.get_history(prompt_id)
                    if prompt_id in history:
                        outputs = history[prompt_id].get("outputs", {})
                        break
                    time.sleep(1)

                self._generation.update_progress("downloading_output", 75 + int(((idx + 1) / num_images) * 20), None, None)
                for _node_id, node_output in outputs.items():
                    if "images" in node_output:
                        for img_meta in node_output["images"]:
                            image_bytes = client.view_image(img_meta["filename"], img_meta.get("subfolder", ""), img_meta.get("type", ""))
                            output_path = self.config.outputs_dir / f"comfyui_image_{timestamp}_{uuid.uuid4().hex[:8]}.png"
                            output_path.write_bytes(image_bytes)
                            output_paths.append(output_path)

            self._generation.update_progress("complete", 100, None, None)
            self._generation.complete_generation([str(path) for path in output_paths])
            return GenerateImageResponse(status="complete", image_paths=[str(path) for path in output_paths])
        except HTTPError as e:
            self._generation.fail_generation(e.detail)
            raise
        except Exception as e:
            self._generation.fail_generation(str(e))
            if "cancelled" in str(e).lower():
                for path in output_paths:
                    path.unlink(missing_ok=True)
                logger.info("Image generation cancelled by user")
                return GenerateImageResponse(status="cancelled")
            raise HTTPError(500, str(e)) from e
