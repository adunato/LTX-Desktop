"""Integration-style tests for workflow management endpoints."""

from __future__ import annotations

import json
from pathlib import Path

from services.comfyui import workflow_parser
from tests.conftest import TEST_ADMIN_TOKEN


WORKFLOW_JSON = {
    "name": "Test Workflow",
    "nodes": [],
}


WORKFLOWS_DIR = Path(workflow_parser.__file__).parent / "workflows"
AUTH_HEADERS = {"Authorization": f"Bearer {TEST_ADMIN_TOKEN}"}


def _create_workflow(workflow_id: str, data: dict | None = None, include_config: bool = False) -> None:
    """Helper to create a workflow file directly."""
    WORKFLOWS_DIR.mkdir(parents=True, exist_ok=True)
    wf_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    wf_path.write_text(json.dumps(data or WORKFLOW_JSON), encoding="utf-8")
    if include_config:
        config_path = WORKFLOWS_DIR / f"{workflow_id}.config.json"
        config_path.write_text(json.dumps({"pipeline": "video_gen", "ui_mapping": {}}), encoding="utf-8")


def _delete_workflow_file(workflow_id: str) -> None:
    """Helper to delete a workflow file directly."""
    wf_path = WORKFLOWS_DIR / f"{workflow_id}.json"
    if wf_path.exists():
        wf_path.unlink()
    config_path = WORKFLOWS_DIR / f"{workflow_id}.config.json"
    if config_path.exists():
        config_path.unlink()


class TestWorkflowDelete:
    def test_delete_workflow(self, client, test_state):
        _create_workflow("test_del_wf", include_config=True)
        try:
            response = client.delete("/api/workflows/test_del_wf", headers=AUTH_HEADERS)
            assert response.status_code == 200
            assert response.json()["status"] == "success"

            assert not (WORKFLOWS_DIR / "test_del_wf.json").exists()
            assert not (WORKFLOWS_DIR / "test_del_wf.config.json").exists()
        finally:
            _delete_workflow_file("test_del_wf")

    def test_delete_workflow_not_found(self, client, test_state):
        response = client.delete("/api/workflows/nonexistent_del", headers=AUTH_HEADERS)
        assert response.status_code == 404

    def test_delete_workflow_invalid_id(self, client, test_state):
        response = client.delete("/api/workflows/bad..id", headers=AUTH_HEADERS)
        assert response.status_code == 400


class TestWorkflowRename:
    def test_rename_workflow(self, client, test_state):
        _create_workflow("test_rename_wf", {"name": "Old Name"})
        try:
            response = client.request(
                "PATCH",
                "/api/workflows/test_rename_wf",
                json={"name": "New Name"},
                headers=AUTH_HEADERS,
            )
            assert response.status_code == 200
            assert response.json()["status"] == "success"
            assert response.json()["id"] == "test_rename_wf"

            wf_path = WORKFLOWS_DIR / "test_rename_wf.json"
            data = json.loads(wf_path.read_text(encoding="utf-8"))
            assert data["name"] == "New Name"
        finally:
            _delete_workflow_file("test_rename_wf")

    def test_rename_workflow_not_found(self, client, test_state):
        response = client.request(
            "PATCH",
            "/api/workflows/nonexistent_rename",
            json={"name": "New Name"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 404


class TestWorkflowDuplicate:
    def test_duplicate_workflow(self, client, test_state):
        _create_workflow("test_dup_wf", {"name": "Original"}, include_config=True)
        try:
            response = client.post(
                "/api/workflows/test_dup_wf/duplicate",
                json={"name": None},
                headers=AUTH_HEADERS,
            )
            assert response.status_code == 200
            assert response.json()["status"] == "success"
            new_id = response.json()["id"]
            assert new_id == "test_dup_wf_1"

            new_wf_path = WORKFLOWS_DIR / f"{new_id}.json"
            assert new_wf_path.exists()
            data = json.loads(new_wf_path.read_text(encoding="utf-8"))
            assert data["name"] == "Original (copy)"

            new_config_path = WORKFLOWS_DIR / f"{new_id}.config.json"
            assert new_config_path.exists()
        finally:
            _delete_workflow_file("test_dup_wf")
            _delete_workflow_file("test_dup_wf_1")

    def test_duplicate_workflow_with_custom_name(self, client, test_state):
        _create_workflow("test_dup_name_wf", {"name": "Original"})
        try:
            response = client.post(
                "/api/workflows/test_dup_name_wf/duplicate",
                json={"name": "My Custom Copy"},
                headers=AUTH_HEADERS,
            )
            assert response.status_code == 200
            new_id = response.json()["id"]

            new_wf_path = WORKFLOWS_DIR / f"{new_id}.json"
            data = json.loads(new_wf_path.read_text(encoding="utf-8"))
            assert data["name"] == "My Custom Copy"
        finally:
            _delete_workflow_file("test_dup_name_wf")
            _delete_workflow_file(new_id)

    def test_duplicate_workflow_not_found(self, client, test_state):
        response = client.post(
            "/api/workflows/nonexistent_dup/duplicate",
            json={},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 404

    def test_duplicate_workflow_incremental_ids(self, client, test_state):
        _create_workflow("test_inc_wf", {"name": "Original"})
        _create_workflow("test_inc_wf_1", {"name": "Copy 1"})
        try:
            response = client.post(
                "/api/workflows/test_inc_wf/duplicate",
                json={},
                headers=AUTH_HEADERS,
            )
            assert response.status_code == 200
            assert response.json()["id"] == "test_inc_wf_2"
        finally:
            _delete_workflow_file("test_inc_wf")
            _delete_workflow_file("test_inc_wf_1")
            _delete_workflow_file("test_inc_wf_2")


class TestWorkflowImportCollision:
    def test_import_same_filename_twice(self, client, test_state):
        """Import the same file twice — should create workflow and workflow_1."""
        # Clean up any pre-existing test files
        for suffix in ["", "_1", "_2"]:
            _delete_workflow_file(f"import_col_wf{suffix}")

        try:
            # First import
            response1 = client.post(
                "/api/workflows/import",
                files={"file": ("import_col_wf.json", json.dumps(WORKFLOW_JSON), "application/json")},
                headers=AUTH_HEADERS,
            )
            assert response1.status_code == 200
            assert response1.json()["id"] == "import_col_wf"

            # Second import — should get _1 suffix
            response2 = client.post(
                "/api/workflows/import",
                files={"file": ("import_col_wf.json", json.dumps(WORKFLOW_JSON), "application/json")},
                headers=AUTH_HEADERS,
            )
            assert response2.status_code == 200
            assert response2.json()["id"] == "import_col_wf_1"

            # Verify both files exist
            assert (WORKFLOWS_DIR / "import_col_wf.json").exists()
            assert (WORKFLOWS_DIR / "import_col_wf_1.json").exists()
        finally:
            for suffix in ["", "_1"]:
                _delete_workflow_file(f"import_col_wf{suffix}")

    def test_import_same_filename_three_times(self, client, test_state):
        """Import the same file three times — should create workflow, workflow_1, workflow_2."""
        for suffix in ["", "_1", "_2", "_3"]:
            _delete_workflow_file(f"import_col3_wf{suffix}")

        try:
            for i in range(3):
                response = client.post(
                    "/api/workflows/import",
                    files={"file": ("import_col3_wf.json", json.dumps(WORKFLOW_JSON), "application/json")},
                    headers=AUTH_HEADERS,
                )
                assert response.status_code == 200
                expected_id = "import_col3_wf" if i == 0 else f"import_col3_wf_{i}"
                assert response.json()["id"] == expected_id

            assert (WORKFLOWS_DIR / "import_col3_wf.json").exists()
            assert (WORKFLOWS_DIR / "import_col3_wf_1.json").exists()
            assert (WORKFLOWS_DIR / "import_col3_wf_2.json").exists()
        finally:
            for suffix in ["", "_1", "_2"]:
                _delete_workflow_file(f"import_col3_wf{suffix}")


class TestPathTraversal:
    def test_delete_path_traversal_rejected(self, client, test_state):
        response = client.delete("/api/workflows/bad..id", headers=AUTH_HEADERS)
        assert response.status_code == 400

    def test_rename_path_traversal_rejected(self, client, test_state):
        response = client.request(
            "PATCH",
            "/api/workflows/bad..id",
            json={"name": "hacked"},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 400

    def test_duplicate_path_traversal_rejected(self, client, test_state):
        response = client.post(
            "/api/workflows/bad..id/duplicate",
            json={},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 400
