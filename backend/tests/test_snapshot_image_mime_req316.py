import mimetypes

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.main import CachedStaticFiles


@pytest.mark.parametrize('image_format,mime', [('WEBP', 'image/webp'), ('PNG', 'image/png'), ('JPEG', 'image/jpeg')])
def test_image_head_reports_actual_format_without_platform_mime_registry(tmp_path, monkeypatch, image_format, mime):
    image_path = tmp_path / 'image.unknown'
    Image.new('RGB', (8, 8)).save(image_path, format=image_format)
    monkeypatch.setattr(mimetypes, 'guess_type', lambda *args, **kwargs: (None, None))
    app = FastAPI()
    app.mount('/images', CachedStaticFiles(directory=tmp_path))
    with TestClient(app) as client:
        head = client.head('/images/image.unknown')
        get = client.get('/images/image.unknown')
    assert head.status_code == get.status_code == 200
    assert head.headers['content-type'] == get.headers['content-type'] == mime
    assert head.content == b''
    assert get.content == image_path.read_bytes()
    assert head.headers['cache-control'] == 'public, max-age=31536000, immutable'


def test_unrecognized_file_keeps_generic_mime_and_missing_file_returns_404(tmp_path):
    (tmp_path / 'data.unknown').write_bytes(b'not an image')
    app = FastAPI()
    app.mount('/images', CachedStaticFiles(directory=tmp_path))
    with TestClient(app) as client:
        response = client.head('/images/data.unknown')
        assert response.status_code == 200
        assert response.headers['content-type'] == 'application/octet-stream'
        assert client.head('/images/missing.webp').status_code == 404
