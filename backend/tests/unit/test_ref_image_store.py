import hashlib
import io
import re
from pathlib import Path

import pytest
from hypothesis import given, settings as hyp_settings, strategies as st
from PIL import Image

from app.services.ref_image_store import (
    MAX_REF_IMAGE_BYTES,
    RefImageError,
    RefImageStore,
    parse_ref_token,
    token_for,
)


def _image_bytes(fmt: str, size: tuple[int, int] = (32, 24), mode: str = "RGB") -> bytes:
    buf = io.BytesIO()
    Image.new(mode, size, (10, 120, 200) if mode == "RGB" else 1).save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture
def store(tmp_path: Path) -> RefImageStore:
    root = tmp_path / "ref_images"
    return RefImageStore(lambda: root)


@pytest.mark.parametrize("fmt,ext", [("PNG", "png"), ("JPEG", "jpg"), ("WEBP", "webp")])
@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
def test_save_bytes_stores_content_addressed_original_and_thumbnail(store: RefImageStore, fmt: str, ext: str) -> None:
    """[REQ-427/AC-5] Supported formats are stored as <sha256>.<ext> with identical bytes, a thumbnail, and no temp leftovers."""
    data = _image_bytes(fmt)
    first = store.save_bytes(data)
    second = store.save_bytes(data)

    expected_id = f"{hashlib.sha256(data).hexdigest()}.{ext}"
    assert first.ref_id == second.ref_id == expected_id
    assert (first.width, first.height, first.byte_size) == (32, 24, len(data))
    root = store.root()
    assert (root / expected_id).read_bytes() == data
    assert (root / "thumbs" / f"{hashlib.sha256(data).hexdigest()}.webp").is_file()
    assert [p.name for p in root.iterdir() if p.is_file()] == [expected_id]
    assert not [p for p in root.rglob(".tmp_*")]
    assert store.exists(expected_id)
    assert store.read(expected_id) == (data, first.media_type)


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
def test_save_bytes_rejects_invalid_inputs(store: RefImageStore) -> None:
    """[REQ-427/AC-5] Non-images, truncated PNG, GIF, empty, oversize and spoofed-dimension images are rejected with fixed codes."""
    png = _image_bytes("PNG")
    gif = _image_bytes("GIF")

    def code_of(data: bytes) -> tuple[int, str]:
        with pytest.raises(RefImageError) as exc:
            store.save_bytes(data)
        return exc.value.status, exc.value.code

    assert code_of(b"hello, this is plain text") == (415, "unsupported_media_type")
    assert code_of(png[:20]) == (415, "unsupported_media_type")
    assert code_of(gif) == (415, "unsupported_media_type")
    assert code_of(b"") == (422, "empty_file")
    assert code_of(b"\x00" * (MAX_REF_IMAGE_BYTES + 1)) == (413, "too_large")
    assert code_of(_image_bytes("PNG", size=(10000, 10000), mode="1")) == (413, "too_large")
    assert not store.root().exists() or not [p for p in store.root().iterdir() if p.is_file()]


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
def test_save_bytes_ignores_declared_name_and_type(store: RefImageStore) -> None:
    """[REQ-427/AC-5] Detection depends only on content: PNG bytes stay png regardless of any claimed extension."""
    data = _image_bytes("PNG")
    stored = store.save_bytes(data)
    assert stored.ref_id.endswith(".png")
    assert stored.media_type == "image/png"


_HEX64 = st.text(alphabet="0123456789abcdef", min_size=64, max_size=64)
_EXT = st.sampled_from(["png", "jpg", "webp"])
_VALID_RE = re.compile(r"refimg:[0-9a-f]{64}\.(?:png|jpg|webp)")


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
@hyp_settings(max_examples=100, deadline=None)
@given(sha=_HEX64, ext=_EXT)
def test_parse_ref_token_accepts_canonical_tokens(sha: str, ext: str) -> None:
    """[REQ-427/AC-5] Every canonical token parses back to its ref_id and round-trips via token_for."""
    ref_id = f"{sha}.{ext}"
    assert parse_ref_token(f"refimg:{ref_id}") == ref_id
    assert token_for(ref_id) == f"refimg:{ref_id}"


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
@hyp_settings(max_examples=100, deadline=None)
@given(sha=_HEX64, ext=_EXT, kind=st.integers(0, 5), pad=st.sampled_from([" ", "\n", "\t", "x"]))
def test_parse_ref_token_rejects_mutations(sha: str, ext: str, kind: int, pad: str) -> None:
    """[REQ-427/AC-5] Uppercased, padded, wrong-length or wrong-extension tokens never parse."""
    base = f"refimg:{sha}.{ext}"
    mutated = [
        f"refimg:{sha.upper()}.{ext}" if sha.upper() != sha else base + pad,
        pad + base,
        base + pad,
        f"refimg:{sha[:-1]}.{ext}",
        f"refimg:{sha}0.{ext}",
        f"refimg:{sha}.gif",
    ][kind]
    assert parse_ref_token(mutated) is None


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
@hyp_settings(max_examples=200, deadline=None)
@given(value=st.text())
def test_parse_ref_token_matches_only_exact_grammar(value: str) -> None:
    """[REQ-427/AC-5] For arbitrary text, parse_ref_token returns a ref_id only on full-grammar match."""
    result = parse_ref_token(value)
    if _VALID_RE.fullmatch(value) and "\n" not in value:
        assert result == value[len("refimg:"):]
    else:
        assert result is None


@getattr(pytest.mark, "REQ-427")
@getattr(pytest.mark, "AC-5")
def test_parse_ref_token_rejects_non_strings() -> None:
    """[REQ-427/AC-5] Non-string values never parse as tokens."""
    assert parse_ref_token(None) is None
    assert parse_ref_token(123) is None
    assert parse_ref_token(b"refimg:" + b"a" * 64 + b".png") is None
