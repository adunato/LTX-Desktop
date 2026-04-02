import os
from fastapi import APIRouter, UploadFile, File, Form, Body
from typing import Any
from services.comfyui.workflow_parser import (
    get_available_workflows, 
    import_workflow, 
    save_workflow_config,
    WORKFLOWS_DIR
)

router = APIRouter(tags=["workflows"])

@router.get("/api/workflows")
def list_workflows() -> list[dict[str, Any]]:
    return get_available_workflows()

@router.post("/api/workflows/import")
async def upload_workflow(
    file: UploadFile = File(...),
    name: str | None = Form(None)
):
    # Save temporary file then import
    if not WORKFLOWS_DIR.exists():
        WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
        
    temp_path = WORKFLOWS_DIR / f"temp_{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        workflow_id = import_workflow(temp_path, name=name)
        return {"status": "success", "id": workflow_id}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        if temp_path.exists():
            os.remove(temp_path)

@router.post("/api/workflows/{workflow_id}/config")
def update_config(
    workflow_id: str,
    config: dict[str, Any] = Body(...)
):
    save_workflow_config(workflow_id, config)
    return {"status": "success"}
