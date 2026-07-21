import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.routers.fonts import FONT_MAPPING, find_font_file

client = TestClient(app)

def test_list_fonts():
    response = client.get("/api/fonts")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    
    # Verify that found fonts are from FONT_MAPPING
    for item in data:
        assert "name" in item
        assert "file_name" in item
        assert item["file_name"] in FONT_MAPPING
        assert FONT_MAPPING[item["file_name"]] == item["name"]

def test_get_font_invalid_name():
    response = client.get("/api/fonts/nonexistent_font_file.ttf")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid font filename"

def test_get_font_valid_but_missing():
    # If a font filename is valid but find_font_file returns None (e.g. on non-Windows/non-standard test environments)
    # let's mock it or check its response.
    # Since FONT_MAPPING contains Windows fonts, they might not all be on Linux CI, but list_fonts will only return existing ones.
    # Let's test the endpoint response based on whether find_font_file finds it.
    found_any = False
    for filename in FONT_MAPPING.keys():
        path = find_font_file(filename)
        response = client.get(f"/api/fonts/{filename}")
        if path and path.exists():
            assert response.status_code == 200
            assert len(response.content) > 0
            found_any = True
        else:
            assert response.status_code == 404
