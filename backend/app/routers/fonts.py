import os
import platform
import re
from pathlib import Path
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/api/fonts", tags=["fonts"])

# Cached fonts list: list of dicts {"name": ..., "file_name": ..., "path": ...}
_CACHED_FONTS: Optional[List[Dict[str, str]]] = None

def get_font_directories() -> List[Path]:
    system = platform.system()
    dirs = []
    if system == "Windows":
        dirs.append(Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts")
        # Also check local user fonts if available
        user_profile = os.environ.get("USERPROFILE")
        if user_profile:
            user_fonts = Path(user_profile) / "AppData/Local/Microsoft/Windows/Fonts"
            if user_fonts.exists():
                dirs.append(user_fonts)
    elif system == "Darwin":  # macOS
        dirs.extend([
            Path("/Library/Fonts"),
            Path("/System/Library/Fonts"),
            Path("~/Library/Fonts").expanduser(),
        ])
    else:  # Linux / other
        dirs.extend([
            Path("/usr/share/fonts"),
            Path("/usr/local/share/fonts"),
            Path("~/.fonts").expanduser(),
            Path("~/.local/share/fonts").expanduser(),
        ])
    return dirs

def _clean_font_title(title: str) -> str:
    # Remove '(TrueType)', '(OpenType)', '(All fonts)' etc.
    cleaned = re.sub(r"\s*\((?:TrueType|OpenType|All fonts)\)\s*$", "", title, flags=re.IGNORECASE).strip()
    return cleaned or title

def scan_system_fonts() -> List[Dict[str, str]]:
    global _CACHED_FONTS
    if _CACHED_FONTS is not None:
        return _CACHED_FONTS

    found_map: Dict[str, Dict[str, str]] = {}  # key: lowercase file_name -> item

    # 1. Windows Registry scan (provides nice font family names)
    if platform.system() == "Windows":
        try:
            import winreg
            font_keys = [
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
                (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
            ]
            for root_key, subkey in font_keys:
                try:
                    with winreg.OpenKey(root_key, subkey) as key:
                        num_values = winreg.QueryInfoKey(key)[1]
                        for i in range(num_values):
                            try:
                                name, val, _ = winreg.EnumValue(key, i)
                                if isinstance(val, str) and isinstance(name, str):
                                    file_name = Path(val).name
                                    ext = Path(val).suffix.lower()
                                    if ext in {".ttf", ".ttc", ".otf", ".fon"}:
                                        key_lower = file_name.lower()
                                        clean_name = _clean_font_title(name)
                                        found_map[key_lower] = {
                                            "name": clean_name,
                                            "file_name": file_name,
                                            "path_str": val
                                        }
                            except Exception:
                                pass
                except Exception:
                    pass
        except Exception:
            pass

    # 2. Directory scan (find all font files and resolve absolute paths)
    resolved_fonts: List[Dict[str, str]] = []
    seen_filenames = set()

    for font_dir in get_font_directories():
        if not font_dir.exists():
            continue
        try:
            for p in font_dir.rglob("*"):
                if p.is_file() and p.suffix.lower() in {".ttf", ".ttc", ".otf"}:
                    fn = p.name
                    fn_lower = fn.lower()
                    if fn_lower in seen_filenames:
                        continue
                    seen_filenames.add(fn_lower)

                    # Get display name
                    if fn_lower in found_map:
                        display_name = found_map[fn_lower]["name"]
                    else:
                        display_name = p.stem.replace("_", " ").replace("-", " ").title()

                    resolved_fonts.append({
                        "name": display_name,
                        "file_name": fn,
                        "full_path": str(p.resolve())
                    })
        except Exception:
            pass

    # Sort alphabetically by name
    resolved_fonts.sort(key=lambda x: x["name"].lower())
    _CACHED_FONTS = resolved_fonts
    return _CACHED_FONTS

def find_font_file(filename: str) -> Optional[Path]:
    fonts = scan_system_fonts()
    fn_lower = filename.lower()
    for f in fonts:
        if f["file_name"].lower() == fn_lower:
            p = Path(f["full_path"])
            if p.exists() and p.is_file():
                return p
    
    # Fallback search in directories
    for font_dir in get_font_directories():
        if not font_dir.exists():
            continue
        direct = font_dir / filename
        if direct.exists() and direct.is_file():
            return direct
        try:
            for p in font_dir.rglob("*"):
                if p.is_file() and p.name.lower() == fn_lower:
                    return p
        except Exception:
            pass
    return None

@router.get("")
def list_fonts():
    fonts = scan_system_fonts()
    return [{"name": f["name"], "file_name": f["file_name"]} for f in fonts]

@router.get("/{font_filename}")
def get_font(font_filename: str):
    # Security: check filename characters
    if ".." in font_filename or "/" in font_filename or "\\" in font_filename:
        raise HTTPException(status_code=400, detail="Invalid font filename")

    path = find_font_file(font_filename)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Font file not found on disk")
    
    return FileResponse(path, media_type="application/octet-stream", filename=path.name)

