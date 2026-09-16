"""
server_status.py - Python ネイティブ サーバーステータス監視エンジン (REQ-246)

外部プロセスを spawn せず、標準ライブラリのみでポート監視・ステータス収集を行う。
"""

from pathlib import Path
from typing import Any, Dict, Optional
import socket
import json
import sys

# デフォルト設定ファイルパス
CONFIG_DEFAULT_PATH = Path(__file__).resolve().parent / "config.json"

# デフォルトポート設定
_DEFAULT_PORTS = {
    "frontend": 5173,
    "backend": 8000,
    "wsl": 8188,
}


def check_port_listening(port: int, timeout: float = 0.5) -> bool:
    """ローカルポート（127.0.0.1）に TCP 接続可能かを判定する。"""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def is_frontend_bundled(dist_index_path: Optional[Path] = None) -> bool:
    """frontend/dist/index.html が存在するか判定する（REQ-262準拠）。"""
    if dist_index_path is None:
        dist_index_path = (
            Path(__file__).resolve().parent.parent.parent
            / "frontend"
            / "dist"
            / "index.html"
        )
    return dist_index_path.exists()


def _load_ports(config_path: Optional[Path] = None) -> Dict[str, int]:
    """config.json からポート設定を読み込む。存在しない場合はデフォルト値を使用。"""
    path = config_path if config_path is not None else CONFIG_DEFAULT_PATH
    ports = dict(_DEFAULT_PORTS)
    try:
        if path.exists():
            with open(path, encoding="utf-8") as f:
                cfg = json.load(f)
            ports["frontend"] = int(cfg.get("frontend", {}).get("port", ports["frontend"]))
            ports["backend"] = int(cfg.get("backend", {}).get("port", ports["backend"]))
            ports["wsl"] = int(cfg.get("wsl", {}).get("port", ports["wsl"]))
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        pass
    return ports


def get_server_status(
    config_path: Optional[Path] = None,
    dist_index_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    fe, be, comfy の稼働状態を収集し、既存 Web Manager / API 互換の辞書を返却する。
    スキーマ:
    {
        "fe": {"name": str, "port": int, "running": bool, "status": "LISTEN"|"BUNDLED"|"STOPPED", "pids": []},
        "be": {"name": "Win BE", "port": int, "running": bool, "status": "LISTEN"|"STOPPED", "pids": []},
        "comfy": {"name": "WSL ComfyUI", "port": int, "running": bool, "status": "LISTEN"|"STOPPED", "pids": []}
    }
    """
    ports = _load_ports(config_path)
    fe_port = ports["frontend"]
    be_port = ports["backend"]
    wsl_port = ports["wsl"]

    # Backend
    be_running = check_port_listening(be_port)
    be_status = "LISTEN" if be_running else "STOPPED"

    # Frontend
    fe_running = check_port_listening(fe_port)
    if fe_running:
        fe_status = "LISTEN"
        fe_name = "React FE (Dev: 5173)"
        fe_is_running = True
    elif is_frontend_bundled(dist_index_path):
        fe_status = "BUNDLED"
        fe_name = "React FE (Bundled on 8000)"
        fe_is_running = be_running
    else:
        fe_status = "STOPPED"
        fe_name = "React FE"
        fe_is_running = False

    # ComfyUI
    comfy_running = check_port_listening(wsl_port)
    comfy_status = "LISTEN" if comfy_running else "STOPPED"

    return {
        "fe": {
            "name": fe_name,
            "port": fe_port,
            "running": fe_is_running,
            "status": fe_status,
            "pids": [],
        },
        "be": {
            "name": "Win BE",
            "port": be_port,
            "running": be_running,
            "status": be_status,
            "pids": [],
        },
        "comfy": {
            "name": "WSL ComfyUI",
            "port": wsl_port,
            "running": comfy_running,
            "status": comfy_status,
            "pids": [],
        },
    }


def main() -> None:
    """CLI エントリポイント。--json フラグで JSON 出力、引数なしで人間可読形式を出力。"""
    use_json = "--json" in sys.argv
    status = get_server_status()

    if use_json:
        print(json.dumps(status, ensure_ascii=False, indent=2))
    else:
        for key, info in status.items():
            running_str = "✓ RUNNING" if info["running"] else "✗ STOPPED"
            print(
                f"[{key.upper():5s}] {info['name']:<30s}  port={info['port']}  "
                f"status={info['status']:<8s}  {running_str}"
            )


if __name__ == "__main__":
    main()
