import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

# ---------------------------------------------------------------------------
# 接続管理
# ---------------------------------------------------------------------------

class ConnectionManager:
    """アクティブな WebSocket 接続を管理するクラス。"""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str) -> None:
        """全クライアントへメッセージを送信する。送信失敗したクライアントは切断扱いにする。"""
        dead: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()

# ---------------------------------------------------------------------------
# ルーター
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api", tags=["websocket"])


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    """WebSocket エンドポイント。クライアントからの ping を 30 秒タイムアウトで待機する。"""
    await manager.connect(websocket)
    try:
        while True:
            # クライアントからの ping 受信を待つ (30s タイムアウト)
            await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        manager.disconnect(websocket)
