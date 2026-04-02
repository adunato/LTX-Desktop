"""Image generation orchestration handler."""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import TYPE_CHECKING, Any, cast

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
        from services.comfyui.image_pipeline import ComfyUIImagePipeline

        generation_id = uuid.uuid4().hex[:8]
        output_paths: list[str] = []
        
        pipeline = ComfyUIImagePipeline(
            workflow_id=workflow_id,
            comfyui_url=self.state.app_settings.comfyui_url,
            outputs_dir=self.config.outputs_dir
        )

        try:
            self._generation.start_api_generation(generation_id)
            self._generation.update_progress("validating_request", 5, None, None)
            
            for idx in range(num_images):
                if self._generation.is_generation_cancelled():
                    raise RuntimeError("Generation was cancelled")

                result = pipeline.generate(
                    prompt=prompt,
                    height=height,
                    width=width,
                    guidance_scale=8.0,
                    num_inference_steps=num_inference_steps,
                    seed=seed + idx,
                    workflow_params=workflow_params,
                    progress_callback=lambda phase, prog: self._generation.update_progress(phase, prog, idx, num_images),
                    is_cancelled=self._generation.is_generation_cancelled
                )
                
                # Get paths from the compatible result object
                if hasattr(result, "image_paths"):
                    output_paths.extend(cast(Any, result).image_paths)

            self._generation.update_progress("complete", 100, None, None)
            self._generation.complete_generation(output_paths)
            return GenerateImageResponse(status="complete", image_paths=output_paths)
        except Exception as e:
            self._generation.fail_generation(str(e))
            if "cancelled" in str(e).lower():
                for path in output_paths:
                    Path(path).unlink(missing_ok=True)
                logger.info("Image generation cancelled by user")
                return GenerateImageResponse(status="cancelled")
            
            # Rethrow as HTTPError if it was already one
            if isinstance(e, HTTPError):
                raise
            raise HTTPError(500, str(e)) from e
