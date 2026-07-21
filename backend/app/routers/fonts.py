import os
import platform
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/fonts", tags=["fonts"])

FONT_MAPPING = {
    "msgothic.ttc": "ＭＳ ゴシック (MS Gothic)",
    "msmincho.ttc": "ＭＳ 明朝 (MS Mincho)",
    "meiryo.ttc": "メイリオ (Meiryo)",
    "meiryob.ttc": "メイリオ ボールド (Meiryo Bold)",
    "yugothm.ttc": "遊ゴシック Medium (Yu Gothic Medium)",
    "yugothb.ttc": "遊ゴシック Bold (Yu Gothic Bold)",
    "yumin.ttf": "遊明朝 (Yu Mincho)",
    "bizudgothic.ttc": "BIZ UDゴシック (BIZ UD Gothic)",
    "bizudminchomedium.ttc": "BIZ UD明朝 (BIZ UD Mincho)",
}

def get_font_directories():
    system = platform.system()
    if system == "Windows":
        return [Path("C:/Windows/Fonts")]
    elif system == "Darwin":  # macOS
        return [Path("/Library/Fonts"), Path("/System/Library/Fonts")]
    else:  # Linux / other
        return [Path("/usr/share/fonts"), Path("/usr/local/share/fonts")]

def find_font_file(filename: str):
    for font_dir in get_font_directories():
        if not font_dir.exists():
            continue
        # Check directly first
        direct_path = font_dir / filename
        if direct_path.exists() and direct_path.is_file():
            return direct_path
        # Check case-insensitive directly
        try:
            for p in font_dir.iterdir():
                if p.is_file() and p.name.lower() == filename.lower():
                    return p
        except Exception:
            pass
        # Otherwise, recursive search
        try:
            for p in font_dir.rglob("*"):
                if p.is_file() and p.name.lower() == filename.lower():
                    return p
        except Exception:
            pass
    return None

@router.get("")
def list_fonts():
    fonts = []
    for file_name, name in FONT_MAPPING.items():
        path = find_font_file(file_name)
        if path:
            fonts.append({"name": name, "file_name": file_name})
    return fonts

@router.get("/{font_filename}")
def get_font(font_filename: str):
    # To prevent path traversal, validate that the requested filename is in our mapping keys (case-insensitive)
    lower_filename = font_filename.lower()
    actual_key = next((k for k in FONT_MAPPING.keys() if k.lower() == lower_filename), None)
    if not actual_key:
        raise HTTPException(status_code=400, detail="Invalid font filename")
    
    path = find_font_file(actual_key)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Font file not found on disk")
    
    # Return FileResponse
    return FileResponse(path, media_type="application/octet-stream", filename=actual_key)
