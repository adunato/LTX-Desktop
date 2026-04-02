import json
import urllib.request
import urllib.error
import urllib.parse
from typing import Any

class ComfyUIClient:
    def __init__(self, base_url: str = "http://127.0.0.1:8188"):
        self.base_url = base_url
        
    def prompt(self, workflow: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}/prompt"
        data = json.dumps({"prompt": workflow}).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"ComfyUI prompt submission failed: {e.read().decode()}") from e
            
    def get_history(self, prompt_id: str) -> dict[str, Any]:
        url = f"{self.base_url}/history/{prompt_id}"
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Failed to fetch ComfyUI history: {e.read().decode()}") from e
            
    def view_image(self, filename: str, subfolder: str, folder_type: str) -> bytes:
        params = urllib.parse.urlencode({
            "filename": filename,
            "subfolder": subfolder,
            "type": folder_type
        })
        url = f"{self.base_url}/view?{params}"
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req) as response:
                return response.read()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Failed to fetch image: {e.read().decode()}") from e
