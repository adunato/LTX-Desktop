from fastapi import APIRouter
from typing import Any
from services.comfyui.workflow_parser import get_available_workflows

router = APIRouter(prefix="/workflows", tags=["workflows"])

@router.get("")
def list_workflows() -> list[dict[str, Any]]:
    return get_available_workflows()
