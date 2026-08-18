import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routers.fonts import scan_system_fonts, find_font_file

client = TestClient(app)

def test_list_fonts():
    response = client.get("/api/fonts")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    if len(data) > 0:
        first = data[0]
        assert "name" in first
        assert "file_name" in first

def test_get_font_invalid_name():
    response = client.get("/api/fonts/invalid..name")
    assert response.status_code == 400

def test_get_font_not_found():
    response = client.get("/api/fonts/totally_nonexistent_font_12345.ttf")
    assert response.status_code == 404

def test_get_font_existing():
    fonts = scan_system_fonts()
    if len(fonts) > 0:
        fn = fonts[0]["file_name"]
        response = client.get(f"/api/fonts/{fn}")
        assert response.status_code == 200
        assert len(response.content) > 0

