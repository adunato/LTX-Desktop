import os
from fastapi import APIRouter, UploadFile, File, Form, Body
from typing import Any
from services.comfyui.workflow_parser import (
    get_available_workflows, 
    import_workflow, 
    save_workflow_config,
    WORKFLOWS_DIR
)
from pathlib import Path

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
    temp_path = WORKFLOWS_DIR / f"temp_{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        workflow_id = import_workflow(temp_path, name=name)
        return {"status": "success", "id": workflow_id}
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
