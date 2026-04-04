import os
import logging
from typing import Any
from fastapi import APIRouter, UploadFile, File, Form, Body, HTTPException

from services.comfyui.workflow_parser import (
    get_available_workflows, 
    import_workflow, 
    save_workflow_config,
    WORKFLOWS_DIR
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

@router.get("")
def list_workflows() -> list[dict[str, Any]]:
    return get_available_workflows()

@router.post("/import")
async def upload_workflow(
    file: UploadFile = File(...),
    name: str | None = Form(None)
):
    # Save temporary file then import
    if not WORKFLOWS_DIR.exists():
        WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    safe_filename = os.path.basename(file.filename)
    temp_path = WORKFLOWS_DIR / f"temp_{safe_filename}"
    try:
        with open(temp_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        workflow_id = import_workflow(temp_path, original_filename=safe_filename, name=name)
        return {"status": "success", "id": workflow_id}
    except Exception as e:
        logger.error(f"Import failed: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if temp_path.exists():
            os.remove(temp_path)

@router.post("/{workflow_id}/config")
def update_config(
    workflow_id: str,
    config: dict[str, Any] = Body(...)
):
    save_workflow_config(workflow_id, config)
    return {"status": "success"}