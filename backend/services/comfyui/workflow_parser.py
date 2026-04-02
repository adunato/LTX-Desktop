import json
from pathlib import Path
from typing import Any

WORKFLOWS_DIR = Path(__file__).parent / "workflows"

def get_available_workflows() -> list[dict[str, Any]]:
    workflows: list[dict[str, Any]] = []
    if not WORKFLOWS_DIR.exists():
        return workflows
        
    for file_path in WORKFLOWS_DIR.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            workflow_id = file_path.stem
            proxy_widgets = data.get("proxyWidgets", {})
            
            workflows.append({
                "id": workflow_id,
                "name": data.get("name", workflow_id),
                "proxyWidgets": proxy_widgets
            })
        except Exception as e:
            print(f"Failed to parse workflow {file_path}: {e}")
            
    return workflows

def get_workflow(workflow_id: str) -> dict[str, Any] | None:
    file_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not file_path.exists():
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None
