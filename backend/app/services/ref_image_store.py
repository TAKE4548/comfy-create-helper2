"""Content-addressed store for reference images (refimg tokens)."""

from __future__ import annotations

import hashlib
import io
import os
import re
import threading
import time
import uuid
import warnings
from pathlib import Path
from typing import Callable, Iterable, NamedTuple

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

REF_TOKEN_RE = re.compile(r"^refimg:([0-9a-f]{64})\.(png|jpg|webp)$")
REF_ID_RE = re.compile(r"^([0-9a-f]{64})\.(png|jpg|webp)$")
MAX_REF_IMAGE_BYTES = 20 * 1024 * 1024
MAX_REF_IMAGE_PIXELS = 50_000_000
THUMBNAIL_MAX_EDGE = 256
THUMBNAIL_QUALITY = 80

STORE_LOCK = threading.RLock()

_FORMAT_TO_EXT = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}
_EXT_TO_MEDIA = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}


class RefImageError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


class StoredRefImage(NamedTuple):
    ref_id: str
    media_type: str
    width: int
    height: int
    byte_size: int


def parse_ref_token(value: object) -> str | None:
    """Return ref_id when value fully matches the token grammar, else None."""
    if not isinstance(value, str):
        return None
    match = REF_TOKEN_RE.fullmatch(value)
    if match is None:
        return None
    return f"{match.group(1)}.{match.group(2)}"


def token_for(ref_id: str) -> str:
    return f"refimg:{ref_id}"


def _media_type_for(ref_id: str) -> str:
    return _EXT_TO_MEDIA[ref_id.rsplit(".", 1)[1]]


def _validate_image(data: bytes) -> tuple[str, int, int]:
    """Validate bytes as a supported image. Returns (ext, width, height)."""
    if not data:
        raise RefImageError(422, "empty_file", "empty file")
    if len(data) > MAX_REF_IMAGE_BYTES:
        raise RefImageError(413, "too_large", "file too large")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as probe:
                fmt = probe.format
                width, height = probe.size
            ext = _FORMAT_TO_EXT.get(fmt or "")
            if ext is None:
                raise RefImageError(415, "unsupported_media_type", "unsupported image format")
            if width * height > MAX_REF_IMAGE_PIXELS:
                raise RefImageError(413, "too_large", "image dimensions too large")
            with Image.open(io.BytesIO(data)) as checked:
                checked.verify()
    except RefImageError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise RefImageError(413, "too_large", "image dimensions too large") from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise RefImageError(415, "unsupported_media_type", "unsupported or corrupt image") from None
    return ext, width, height


def _make_thumbnail(data: bytes) -> bytes:
    with Image.open(io.BytesIO(data)) as opened:
        image = ImageOps.exif_transpose(opened)
        image.load()
        has_alpha = "A" in image.getbands() or "transparency" in image.info
        image = image.convert("RGBA" if has_alpha else "RGB")
        image.thumbnail((THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE))
        buf = io.BytesIO()
        image.save(buf, format="WEBP", quality=THUMBNAIL_QUALITY)
        return buf.getvalue()


def _default_root() -> Path:
    return Path(settings.snapshot_path).parent / "ref_images"


class RefImageStore:
    def __init__(self, root: Callable[[], Path] | None = None) -> None:
        self._root_fn: Callable[[], Path] = root if root is not None else _default_root

    @classmethod
    def default(cls) -> "RefImageStore":
        return cls()

    def root(self) -> Path:
        return self._root_fn()

    def _thumb_dir(self) -> Path:
        return self.root() / "thumbs"

    def _write_atomic(self, dest: Path, payload: bytes) -> None:
        """Write payload to a temp file under the store root and replace dest. Caller holds STORE_LOCK."""
        root = self.root()
        tmp = root / f".tmp_{uuid.uuid4().hex}"
        try:
            tmp.write_bytes(payload)
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp.replace(dest)
        finally:
            tmp.unlink(missing_ok=True)

    def save_bytes(self, data: bytes) -> StoredRefImage:
        ext, width, height = _validate_image(data)
        digest = hashlib.sha256(data).hexdigest()
        ref_id = f"{digest}.{ext}"
        root = self.root()
        original = root / ref_id
        thumb = self._thumb_dir() / f"{digest}.webp"
        thumb_bytes: bytes | None = None
        if not thumb.is_file():
            try:
                thumb_bytes = _make_thumbnail(data)
            except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
                raise RefImageError(415, "unsupported_media_type", "unsupported or corrupt image") from None
        with STORE_LOCK:
            root.mkdir(parents=True, exist_ok=True)
            if original.is_file():
                os.utime(original, None)
            else:
                self._write_atomic(original, data)
            if not thumb.is_file():
                if thumb_bytes is None:
                    thumb_bytes = _make_thumbnail(data)
                self._write_atomic(thumb, thumb_bytes)
        return StoredRefImage(ref_id, _media_type_for(ref_id), width, height, len(data))

    def exists(self, ref_id: str) -> bool:
        if not isinstance(ref_id, str) or REF_ID_RE.fullmatch(ref_id) is None:
            return False
        return (self.root() / ref_id).is_file()

    def _not_found(self) -> RefImageError:
        return RefImageError(404, "not_found", "reference image not found")

    def read(self, ref_id: str) -> tuple[bytes, str]:
        if not isinstance(ref_id, str) or REF_ID_RE.fullmatch(ref_id) is None:
            raise self._not_found()
        try:
            return (self.root() / ref_id).read_bytes(), _media_type_for(ref_id)
        except (FileNotFoundError, IsADirectoryError):
            raise self._not_found() from None

    def describe(self, ref_id: str) -> StoredRefImage:
        data, media_type = self.read(ref_id)
        try:
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
        except (OSError, SyntaxError, ValueError):
            raise self._not_found() from None
        return StoredRefImage(ref_id, media_type, width, height, len(data))

    def thumbnail_path(self, ref_id: str) -> Path:
        data, _ = self.read(ref_id)
        digest = ref_id.split(".", 1)[0]
        thumb = self._thumb_dir() / f"{digest}.webp"
        if thumb.is_file():
            return thumb
        try:
            payload = _make_thumbnail(data)
        except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
            raise self._not_found() from None
        with STORE_LOCK:
            if not (self.root() / ref_id).is_file():
                raise self._not_found()
            if not thumb.is_file():
                self._write_atomic(thumb, payload)
        return thumb

    def touch(self, ref_id: str, *, min_interval_s: float = 0.0) -> bool:
        """Extend the GC grace period. Returns False only when the original does not exist."""
        if not isinstance(ref_id, str) or REF_ID_RE.fullmatch(ref_id) is None:
            return False
        path = self.root() / ref_id
        with STORE_LOCK:
            try:
                mtime = path.stat().st_mtime
            except OSError:
                return False
            if min_interval_s > 0 and (time.time() - mtime) <= min_interval_s:
                return True
            try:
                os.utime(path, None)
            except OSError:
                return False
            return True

    def claim(self, ref_ids: Iterable[str]) -> list[str]:
        """Atomically verify existence and touch each ref_id; return the missing ones."""
        missing: list[str] = []
        with STORE_LOCK:
            for ref_id in ref_ids:
                if not self.touch(ref_id):
                    missing.append(ref_id)
        return missing
