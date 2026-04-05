import json
import logging
import re
import shutil
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
    "image_path": ["image", "input_image", "image_path", "first_frame", "conditioning_image"],
    "video_path": ["video", "input_video", "video_path"],
    "mask_path": ["mask", "input_mask", "mask_path"],
    "audio_path": ["audio", "input_audio", "audio_path"],
    "start_time": ["start_time", "trim_start"],
    "end_time": ["end_time", "trim_end"],
}

PIPELINE_REQUIRED_KEYS = {
    "image_gen": ["prompt", "seed", "height", "width"],
    "video_gen": ["prompt", "seed", "height", "width", "num_frames", "frame_rate"],
    "retake": ["video_path", "mask_path", "prompt", "seed", "start_time", "end_time"],
    "ic_lora": ["prompt", "seed", "height", "width", "num_frames", "frame_rate"],
}

def _resolve_ltx_key(widget_name: Any) -> str | None:
    if not isinstance(widget_name, str):
        return None
    widget_name_lower = widget_name.lower()
    for ltx_key, aliases in STANDARD_LTX_KEYS.items():
        if widget_name_lower == ltx_key or widget_name_lower in aliases:
            return ltx_key
    return None

def _get_workflow_config(workflow_id: str) -> dict[str, Any]:
    config_path = WORKFLOWS_DIR / f"{workflow_id}.config.json"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return cast(dict[str, Any], json.load(f))
        except Exception:
            pass
    return {}

def _sanitize_workflow_id(workflow_id: str) -> str:
    """Sanitize workflow ID to only contain URL-safe characters."""
    # Replace any character that's not alphanumeric, underscore, or hyphen with underscore
    safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", workflow_id)
    # Remove consecutive underscores
    safe_id = re.sub(r"_+", "_", safe_id)
    # Remove leading/trailing underscores
    return safe_id.strip("_")


def _migrate_invalid_workflow_files() -> None:
    """Rename workflow files with invalid IDs to use safe characters."""
    if not WORKFLOWS_DIR.exists():
        return
    
    for file_path in WORKFLOWS_DIR.glob("*.json"):
        if file_path.name.endswith(".config.json"):
            continue  # Skip config files, they'll be handled with their workflow
        
        old_stem = file_path.stem
        safe_stem = _sanitize_workflow_id(old_stem)
        
        if old_stem != safe_stem:
            new_path = file_path.with_name(f"{safe_stem}.json")
            config_path = file_path.with_name(f"{old_stem}.config.json")
            new_config_path = file_path.with_name(f"{safe_stem}.config.json")
            
            # Handle collision for the new name
            if new_path.exists():
                counter = 1
                while new_path.exists():
                    new_path = file_path.with_name(f"{safe_stem}_{counter}.json")
                    new_config_path = file_path.with_name(f"{safe_stem}_{counter}.config.json")
                    counter += 1
            
            try:
                file_path.rename(new_path)
                if config_path.exists():
                    config_path.rename(new_config_path)
                logger.info(f"Migrated workflow file: {old_stem} -> {new_path.stem}")
            except Exception as e:
                logger.error(f"Failed to migrate {old_stem}: {e}")


def get_available_workflows() -> list[dict[str, Any]]:
    """Get list of available workflows, migrating invalid filenames on first run."""
    # Run migration once to fix any invalid workflow IDs
    _migrate_invalid_workflow_files()
    workflows: list[dict[str, Any]] = []
    if not WORKFLOWS_DIR.exists():
        WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
        return workflows
        
    for file_path in WORKFLOWS_DIR.glob("*.json"):
        if file_path.name.endswith(".config.json"):
            continue
            
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data: dict[str, Any] = json.load(f)
            
            workflow_id = file_path.stem
            config = _get_workflow_config(workflow_id)
            
            # Default pipeline assignment if not in config
            pipeline = config.get("pipeline", "image_gen")
            
            # 1. Start with automapping from proxyWidgets (Graph Format)
            ui_mapping: dict[str, dict[str, str]] = {}
            all_inputs = []
            
            nodes = data.get("nodes")
            if isinstance(nodes, list):
                # Graph Format

                # Pre-scan: find which internal nodes are proxied by groups
                proxied_node_ids: set[str] = set()
                for node in nodes:
                    if not isinstance(node, dict):
                        continue
                    node_type = str(node.get("type", ""))
                    if node_type != "GroupNode":
                        continue
                    properties = node.get("properties")
                    if isinstance(properties, dict):
                        proxy_widgets = properties.get("proxyWidgets")
                        if isinstance(proxy_widgets, list):
                            for proxy in proxy_widgets:
                                if isinstance(proxy, list) and len(proxy) >= 1:
                                    proxied_node_ids.add(str(proxy[0]))

                for node in nodes:
                    if not isinstance(node, dict):
                        continue
                    node_id = str(node.get("id", ""))
                    node_type = str(node.get("type", "Unknown"))
                    node_title = str(node.get("title", node_type))

                    # Discovery: check proxyWidgets for LTX key mapping
                    properties = node.get("properties")
                    if isinstance(properties, dict):
                        proxy_widgets = properties.get("proxyWidgets")
                        if isinstance(proxy_widgets, list):
                            for proxy in proxy_widgets:
                                if isinstance(proxy, list) and len(proxy) >= 2:
                                    target_node_id = str(proxy[0])
                                    target_widget_name = str(proxy[1])
                                    ltx_key = _resolve_ltx_key(target_widget_name)
                                    if ltx_key:
                                        ui_mapping[ltx_key] = {
                                            "node": target_node_id,
                                            "field": target_widget_name
                                        }

                    # Extract all inputs for manual mapping
                    # Skip internal nodes that are proxied by a group — their inputs
                    # are exposed at the group level and would be duplicates
                    if node_type != "GroupNode" and node_id in proxied_node_ids:
                        continue

                    inputs = node.get("inputs", {})
                    if isinstance(inputs, dict):
                        for field_name, field_value in inputs.items():
                            # Skip inputs that are linked to other nodes (e.g., ["75:65", 0])
                            if isinstance(field_value, list) and len(field_value) == 2:
                                continue

                            if field_name == "value":
                                label = node_title
                            else:
                                label = f"{node_title} \u2192 {field_name}"

                            all_inputs.append({
                                "id": f"{node_id}:{field_name}",
                                "label": label,
                                "node": node_id,
                                "field": field_name,
                                "node_title": node_title,
                                "class_type": node_type
                            })
            else:
                # API Format (flat dict keyed by node ID).
                # API format flattens subgraphs — there's no group info.
                # Use the field name as the primary label so it's easy to scan,
                # and store the full node path separately for display.
                for node_id, node in data.items():
                    if not isinstance(node, dict):
                        continue
                    node_type = node.get("class_type", "Unknown")
                    meta = node.get("_meta", {})
                    node_title = meta.get("title", node_type)

                    inputs = node.get("inputs", {})
                    if isinstance(inputs, dict):
                        for field_name, field_value in inputs.items():
                            # Skip inputs that are linked to other nodes (e.g., ["75:65", 0])
                            if isinstance(field_value, list) and len(field_value) == 2:
                                continue

                            if field_name == "value":
                                label = node_title
                            else:
                                label = field_name

                            all_inputs.append({
                                "id": f"{node_id}:{field_name}",
                                "label": label,
                                "node": node_id,
                                "field": field_name,
                                "node_title": node_title,
                                "class_type": node_type
                            })

            # 2. Layer on user manual overrides from config
            user_mapping = config.get("ui_mapping", {})
            for key, val in user_mapping.items():
                if isinstance(val, dict) and "node" in val and "field" in val:
                    ui_mapping[key] = val

            # 3. Calculate Health (LED)
            required = PIPELINE_REQUIRED_KEYS.get(pipeline, [])
            is_healthy = all(key in ui_mapping for key in required)
            
            workflows.append({
                "id": workflow_id,
                "name": str(data.get("name", workflow_id)),
                "pipeline": pipeline,
                "ui_mapping": ui_mapping,
                "is_healthy": is_healthy,
                "all_inputs": all_inputs
            })
                
        except Exception as e:
            logger.error(f"Failed to parse workflow {file_path}: {e}")
            
    return workflows

def save_workflow_config(workflow_id: str, config: dict[str, Any]) -> None:
    config_path = WORKFLOWS_DIR / f"{workflow_id}.config.json"
    existing = _get_workflow_config(workflow_id)
    existing.update(config)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2)

def delete_workflow(workflow_id: str) -> None:
    """Delete workflow JSON and config files."""
    workflow_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    config_path = WORKFLOWS_DIR / f"{workflow_id}.config.json"
    workflow_path.unlink(missing_ok=True)
    config_path.unlink(missing_ok=True)


def rename_workflow(workflow_id: str, new_name: str) -> None:
    """Update the display name in the workflow JSON (does not change file/ID)."""
    file_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not file_path.exists():
        raise FileNotFoundError(f"Workflow '{workflow_id}' not found")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["name"] = new_name
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def duplicate_workflow(workflow_id: str, new_name: str | None = None) -> str:
    """Copy workflow + config to a new unique ID. Returns new workflow_id."""
    source_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not source_path.exists():
        raise FileNotFoundError(f"Workflow '{workflow_id}' not found")

    # Generate unique ID
    stem = workflow_id
    counter = 1
    while (WORKFLOWS_DIR / f"{stem}_{counter}.json").exists():
        counter += 1
    new_id = f"{stem}_{counter}"

    # Copy workflow
    target_path = WORKFLOWS_DIR / f"{new_id}.json"
    shutil.copy2(source_path, target_path)

    # Update name
    with open(target_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["name"] = new_name or f"{data.get('name', workflow_id)} (copy)"
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # Copy config if exists
    source_config = WORKFLOWS_DIR / f"{workflow_id}.config.json"
    if source_config.exists():
        target_config = WORKFLOWS_DIR / f"{new_id}.config.json"
        shutil.copy2(source_config, target_config)

    return new_id


def import_workflow(file_path: Path, original_filename: str | None = None, name: str | None = None) -> str:
    """Import a workflow file, handling filename collisions by appending _N suffixes."""
    if not file_path.exists():
        raise ValueError("File does not exist")

    base_filename = original_filename if original_filename else file_path.name
    
    # Sanitize filename to only allow safe characters for workflow IDs
    stem = Path(base_filename).stem
    suffix = Path(base_filename).suffix
    # Replace any character that's not alphanumeric, underscore, or hyphen with underscore
    safe_stem = re.sub(r"[^a-zA-Z0-9_-]", "_", stem)
    # Remove consecutive underscores
    safe_stem = re.sub(r"_+", "_", safe_stem)
    # Remove leading/trailing underscores
    safe_stem = safe_stem.strip("_")
    
    target_path = WORKFLOWS_DIR / f"{safe_stem}{suffix}"

    # Handle collision
    if target_path.exists():
        counter = 1
        while target_path.exists():
            target_path = WORKFLOWS_DIR / f"{safe_stem}_{counter}{suffix}"
            counter += 1

    # Copy file
    shutil.copy2(file_path, target_path)
    workflow_id = target_path.stem

    # Set name if provided
    if name:
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["name"] = name
            with open(target_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    return workflow_id

def get_workflow(workflow_id: str) -> dict[str, Any] | None:
    file_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if not file_path.exists():
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return cast(dict[str, Any], json.load(f))
    except Exception:
        return None
