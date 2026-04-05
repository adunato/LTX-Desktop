import os
import re
import logging
from typing import Any
from fastapi import APIRouter, UploadFile, File, Form, Body, HTTPException
from pydantic import BaseModel

from services.comfyui.workflow_parser import (
    get_available_workflows,
    import_workflow,
    save_workflow_config,
    delete_workflow,
    rename_workflow,
    duplicate_workflow,
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


class RenameRequest(BaseModel):
    name: str


class DuplicateRequest(BaseModel):
    name: str | None = None


def _validate_workflow_id(workflow_id: str) -> None:
    """Reject workflow IDs that contain path traversal or invalid characters."""
    if not re.match(r"^[a-zA-Z0-9_-]+$", workflow_id):
        raise HTTPException(status_code=400, detail="Invalid workflow ID")


@router.delete("/{workflow_id}")
def delete_workflow_endpoint(workflow_id: str):
    _validate_workflow_id(workflow_id)

    workflow_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not workflow_path.exists():
        raise HTTPException(status_code=404, detail="Workflow not found")

    delete_workflow(workflow_id)
    return {"status": "success"}


@router.patch("/{workflow_id}")
def rename_workflow_endpoint(workflow_id: str, body: RenameRequest):
    _validate_workflow_id(workflow_id)

    try:
        rename_workflow(workflow_id, body.name)
        return {"status": "success", "id": workflow_id}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")


@router.post("/{workflow_id}/duplicate")
def duplicate_workflow_endpoint(workflow_id: str, body: DuplicateRequest | None = None):
    _validate_workflow_id(workflow_id)

    try:
        new_id = duplicate_workflow(workflow_id, body.name if body else None)
        return {"status": "success", "id": new_id}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Workflow not found")