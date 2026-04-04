import json
import urllib.request
import urllib.error
import urllib.parse
import uuid
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

    def view_video(self, filename: str, subfolder: str, folder_type: str) -> bytes:
        """Download a video file from ComfyUI output."""
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
            raise RuntimeError(f"Failed to fetch video: {e.read().decode()}") from e

    def upload_image(self, file_path: str) -> str:
        """Upload an image file to ComfyUI server. Returns the filename."""
        import os
        url = f"{self.base_url}/upload/image"
        filename = os.path.basename(file_path)
        
        # Build multipart form data
        boundary = "----WebKitFormBoundary" + uuid.uuid4().hex[:16]
        body: list[bytes] = []
        
        with open(file_path, "rb") as f:
            file_data = f.read()
        
        body.append(f"------WebKitFormBoundary{boundary}\r\n".encode())
        body.append(f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'.encode())
        body.append(b"Content-Type: application/octet-stream\r\n\r\n")
        body.append(file_data)
        body.append(f"\r\n------WebKitFormBoundary{boundary}--\r\n".encode())
        
        data = b"".join(body)
        req = urllib.request.Request(url, data=data)
        req.add_header("Content-Type", f"multipart/form-data; boundary=----WebKitFormBoundary{boundary}")
        
        try:
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode())
                return result.get("name", filename)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Failed to upload image: {e.read().decode()}") from e

    def upload_audio(self, file_path: str) -> str:
        """Upload an audio file to ComfyUI server. Returns the filename."""
        import os
        url = f"{self.base_url}/upload/image"  # ComfyUI uses same endpoint for media
        filename = os.path.basename(file_path)
        
        # Build multipart form data
        boundary = "----WebKitFormBoundary" + uuid.uuid4().hex[:16]
        body: list[bytes] = []
        
        with open(file_path, "rb") as f:
            file_data = f.read()
        
        body.append(f"------WebKitFormBoundary{boundary}\r\n".encode())
        body.append(f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'.encode())
        body.append(b"Content-Type: application/octet-stream\r\n\r\n")
        body.append(file_data)
        body.append(f"\r\n------WebKitFormBoundary{boundary}--\r\n".encode())
        
        data = b"".join(body)
        req = urllib.request.Request(url, data=data)
        req.add_header("Content-Type", f"multipart/form-data; boundary=----WebKitFormBoundary{boundary}")
        
        try:
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode())
                return result.get("name", filename)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Failed to upload audio: {e.read().decode()}") from e
