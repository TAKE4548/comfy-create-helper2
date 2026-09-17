import http.server
import json
import os
import socket
import socketserver
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path
import logging
from logging.handlers import RotatingFileHandler
from typing import Optional
import server_status

# pythonw.exe などの非コンソール環境下での NoneType クラッシュを防止
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_FILE = SCRIPT_DIR / "config.json"
PS_SCRIPT = SCRIPT_DIR / "server-manager.ps1"
LOGS_DIR = SCRIPT_DIR / "logs"
PORT = 8899

# ロガー初期化 (5MB, 5世代, UTF-8)
LOGS_DIR.mkdir(parents=True, exist_ok=True)
_logger = logging.getLogger("server_manager")
_logger.setLevel(logging.INFO)
if not _logger.handlers:
    _log_path = LOGS_DIR / "web_manager.log"
    try:
        _rf_handler = RotatingFileHandler(
            str(_log_path),
            maxBytes=5 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
            delay=True
        )
        _formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        _rf_handler.setFormatter(_formatter)
        _logger.addHandler(_rf_handler)
    except Exception as e:
        # ロギングハンドラ初期化失敗時もモジュールインポートを妨げない
        pass

# Windows 非表示実行フラグ
CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

# 多重実行防止ロックおよびステータスキャッシュ
_status_lock = threading.Lock()
_last_status_cache = None
_last_status_time = 0.0


# 後方互換性エイリアス: server_status.check_port_listening に委譲
def check_port_listening(port: int, timeout: float = 0.5) -> bool:
    return server_status.check_port_listening(port, timeout)


def get_action_timeout(action: str, service: str = "", config: Optional[dict] = None) -> int:
    """
    アクション種別および対象サービスに応じた動的タイムアウト秒数を算出する。
    """
    act = (action or "").lower()
    svc = (service or "").lower()

    if act in ["restart", "reboot-service"]:
        if svc in ["backend", "be"]:
            return 35
        if svc in ["comfy", "wsl"]:
            return 50
        if svc in ["frontend", "fe"]:
            return 35
        if not svc or svc == "all":
            return 90
        return 35

    if act == "start":
        if svc in ["backend", "be", "frontend", "fe"]:
            return 25
        if svc in ["comfy", "wsl"]:
            return 35
        if not svc or svc == "all":
            return 60
        return 25

    if act == "stop":
        if not svc or svc == "all":
            return 25
        return 15

    return 30


def read_log_file(filename: str, tail_lines: int = 200) -> tuple[bool, str, int]:
    target = LOGS_DIR / filename
    if not target.exists():
        return False, "ログファイルはまだ生成されていません (サービス未起動)", 0
    try:
        file_size = target.stat().st_size
        seek_size = 256 * 1024  # 256KB

        if file_size > seek_size:
            # 末尾 seek 最適化
            try:
                with open(target, "rb") as f:
                    f.seek(file_size - seek_size)
                    raw_chunk = f.read(seek_size)
                try:
                    text_chunk = raw_chunk.decode("utf-8", errors="replace")
                except Exception:
                    text_chunk = raw_chunk.decode("cp932", errors="replace")
                chunk_lines = text_chunk.splitlines(keepends=True)
                tail = chunk_lines[-tail_lines:] if len(chunk_lines) > tail_lines else chunk_lines
                return True, "".join(tail), len(chunk_lines)
            except Exception as e:
                return False, f"ログ読み込みエラー: {e}", 0
        else:
            # 全体読み出し
            try:
                with open(target, "r", encoding="utf-8") as f:
                    lines = f.readlines()
            except UnicodeDecodeError:
                try:
                    with open(target, "r", encoding="cp932") as f:
                        lines = f.readlines()
                except UnicodeDecodeError:
                    with open(target, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.readlines()

            tail = lines[-tail_lines:] if len(lines) > tail_lines else lines
            return True, "".join(tail), len(lines)
    except Exception as e:
        return False, f"ログ読み込みエラー: {e}", 0

def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prompt Surgeon - Server Manager</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --success: #22c55e;
      --danger: #ef4444;
      --warning: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 1.6rem; font-weight: 700; color: var(--primary); }
    .status-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-running { background-color: rgba(34, 197, 94, 0.2); color: var(--success); border: 1px solid var(--success); }
    .badge-stopped { background-color: rgba(239, 68, 68, 0.2); color: var(--danger); border: 1px solid var(--danger); }
    .badge-timeout { background-color: rgba(245, 158, 11, 0.2); color: var(--warning); border: 1px solid var(--warning); }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
    }
    .card h2 { font-size: 1.2rem; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
    .card p { font-size: 0.9rem; color: var(--text-muted); margin-bottom: 6px; }
    .card .pids { font-family: monospace; font-size: 0.85rem; color: #cbd5e1; }
    
    .btn-group { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
    button {
      background: #2563eb;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover:not(:disabled) { background: #1d4ed8; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    button.btn-danger { background: #dc2626; }
    button.btn-danger:hover:not(:disabled) { background: #b91c1c; }
    button.btn-secondary { background: #475569; }
    button.btn-secondary:hover:not(:disabled) { background: #334155; }
    button.btn-success { background: #16a34a; }
    button.btn-success:hover:not(:disabled) { background: #15803d; }
    
    .global-controls {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      background: var(--card-bg);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      align-items: center;
      flex-wrap: wrap;
    }
    
    .section-title { font-size: 1.1rem; margin-bottom: 12px; font-weight: 600; }
    pre {
      background: #020617;
      border: 1px solid var(--border);
      padding: 12px;
      border-radius: 6px;
      font-family: Consolas, monospace;
      font-size: 0.85rem;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    textarea {
      width: 100%;
      height: 180px;
      background: #020617;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 10px;
      border-radius: 6px;
      font-family: Consolas, monospace;
      font-size: 0.85rem;
      resize: vertical;
    }
    .tab-btn {
      background: #1e293b;
      color: var(--text-muted);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab-btn:hover:not(:disabled) {
      background: #334155;
      color: var(--text);
    }
    .tab-btn.active {
      background: #0284c7;
      color: #ffffff;
      border-color: #38bdf8;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Prompt Surgeon Server Manager</h1>
        <p style="color: var(--text-muted); font-size: 0.85rem;">WSL2 ComfyUI & Windows Server Orchestrator</p>
      </div>
      <div style="display: flex; align-items: center;">
        <span id="lan-url" style="font-size: 0.8rem; color: var(--primary); margin-right: 12px; font-weight: 500;"></span>
        <span id="auto-refresh-label" style="font-size: 0.8rem; color: var(--text-muted);">Auto-refreshing (5s)</span>
      </div>
    </header>

    <div class="global-controls">
      <strong style="margin-right: 8px;">一括操作:</strong>
      <button class="btn-success" onclick="triggerAction('start')">▶ 全サービス起動</button>
      <button class="btn-danger" onclick="triggerAction('stop')">⏹ 全サービス停止</button>
      <button class="btn-secondary" onclick="triggerAction('restart')">🔄 全サービス再起動</button>
      <button class="btn-secondary" onclick="fetchStatus()">🔁 状態手動更新</button>
    </div>

    <div class="grid" id="service-grid">
      <!-- Cards rendered via JS -->
    </div>

    <div class="card" style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <!-- タブヘッダー -->
        <div class="tab-header" style="display: flex; gap: 6px;">
          <button class="tab-btn active" data-service="backend" onclick="selectTab('backend')">🖥️ Win BE</button>
          <button class="tab-btn" data-service="frontend" onclick="selectTab('frontend')">🌐 React FE</button>
          <button class="tab-btn" data-service="comfy" onclick="selectTab('comfy')">⚡ WSL ComfyUI</button>
          <button class="tab-btn" data-service="manager" onclick="selectTab('manager')">📋 Manager 操作</button>
        </div>
        <!-- コントロールバー -->
        <div style="display: flex; align-items: center; gap: 12px; font-size: 0.82rem;">
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="checkbox" id="auto-refresh-log" checked> 🔄 ログ自動更新 (2s)
          </label>
          <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="checkbox" id="auto-scroll-log" checked> ⬇ 最新追従
          </label>
          <select id="tail-lines-select" onchange="fetchLogs()" style="background: #020617; color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px;">
            <option value="100">100行</option>
            <option value="200" selected>200行</option>
            <option value="500">500行</option>
          </select>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.78rem;" onclick="fetchLogs()">🔄 今すぐ更新</button>
        </div>
      </div>

      <!-- コンソール表示エリア -->
      <pre id="log-output" style="max-height: 380px; height: 380px; overflow-y: auto; background: #050914; border: 1px solid var(--border); padding: 12px; border-radius: 6px; font-family: Consolas, monospace; font-size: 0.82rem; white-space: pre-wrap; word-break: break-all; color: #e2e8f0;"></pre>
      <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 0.75rem; color: var(--text-muted);">
        <span id="log-status">待機中...</span>
        <span id="log-updated">最終更新: -</span>
      </div>
    </div>

    <div class="card">
      <h2 class="section-title">構成ファイル設定 (config.json)</h2>
      <textarea id="config-editor"></textarea>
      <div class="btn-group">
        <button class="btn-success" onclick="saveConfig()">設定を保存</button>
        <button class="btn-secondary" onclick="loadConfig()">再読み込み</button>
      </div>
    </div>
  </div>

  <script>
    const serviceGrid = document.getElementById('service-grid');
    const logOutput = document.getElementById('log-output');
    const configEditor = document.getElementById('config-editor');
    const lanUrlSpan = document.getElementById('lan-url');
    const autoRefreshLog = document.getElementById('auto-refresh-log');
    const autoScrollLog = document.getElementById('auto-scroll-log');
    const tailSelect = document.getElementById('tail-lines-select');
    const logStatus = document.getElementById('log-status');
    const logUpdated = document.getElementById('log-updated');

    let activeService = 'backend';
    let actionLogContent = '待機中...';

    function setControlsDisabled(disabled) {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        btn.disabled = disabled;
      });
    }

    function selectTab(service) {
      activeService = service;
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-service') === service);
      });
      fetchLogs();
    }

    async function fetchLogs() {
      if (activeService === 'manager') {
        logOutput.textContent = actionLogContent;
        logStatus.textContent = "Manager 実行ログ表示中";
        logUpdated.textContent = "最終更新: " + new Date().toLocaleTimeString();
        if (autoScrollLog.checked) logOutput.scrollTop = logOutput.scrollHeight;
        return;
      }

      const tail = tailSelect.value;
      try {
        const res = await fetch(`/api/logs?service=${activeService}&tail=${tail}`);
        const data = await res.json();
        if (data.error) {
          logStatus.textContent = data.error;
          return;
        }
        const wasAtBottom = logOutput.scrollHeight - logOutput.scrollTop - logOutput.clientHeight < 40;
        logOutput.textContent = data.content || "(出力なし)";
        logStatus.textContent = `${data.filename} (${data.lines}行中 末尾表示)`;
        logUpdated.textContent = "最終更新: " + new Date().toLocaleTimeString();
        if (autoScrollLog.checked && wasAtBottom) {
          logOutput.scrollTop = logOutput.scrollHeight;
        }
      } catch (err) {
        logStatus.textContent = "ログ取得エラー: " + err;
      }
    }

    let isFetchingStatus = false;
    async function fetchStatus() {
      if (isFetchingStatus) return;
      isFetchingStatus = true;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      try {
        const res = await fetch('/api/status', { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        renderServices(data);
      } catch (err) {
        clearTimeout(timeoutId);
        if (activeService === 'manager') {
          actionLogContent = "Error fetching status: " + err;
          logOutput.textContent = actionLogContent;
        }
      } finally {
        isFetchingStatus = false;
      }
    }

    function renderServices(status) {
      serviceGrid.innerHTML = '';
      for (const [key, s] of Object.entries(status)) {
        const isRunning = s.running;
        const isTimeout = s.status === 'TIMEOUT';
        const isBundled = s.status === 'BUNDLED';
        const badgeClass = isTimeout ? 'badge-timeout' : ((isRunning || isBundled) ? 'badge-running' : 'badge-stopped');
        const card = document.createElement('div');
        card.className = 'card';

        let actionButtons = '';
        if (key === 'fe') {
          if (s.status === 'LISTEN') {
            actionButtons = `
              <button class="btn-danger" onclick="triggerAction('stop', '${key}')">⏹ Vite 停止</button>
              <button class="btn-secondary" onclick="triggerAction('reboot-service', '${key}')">🔄 再起動</button>
            `;
          } else {
            // BUNDLED または STOPPED の場合、Vite 開発サーバーをオンデマンド個別起動可能
            actionButtons = `
              <button class="btn-success" onclick="triggerAction('start', '${key}')">▶ Vite 起動（開発用）</button>
            `;
          }
        } else {
          actionButtons = `
            ${!isRunning ? `<button class="btn-success" onclick="triggerAction('start', '${key}')">起動</button>` : ''}
            ${isRunning ? `<button class="btn-danger" onclick="triggerAction('stop', '${key}')">停止</button>` : ''}
            <button class="btn-secondary" onclick="triggerAction('reboot-service', '${key}')">再起動</button>
          `;
        }

        card.innerHTML = `
          <h2>
            <span>${s.name}</span>
            <span class="status-badge ${badgeClass}">${s.status}</span>
          </h2>
          <p>ポート: <strong>${s.port}</strong></p>
          <p class="pids">PID: ${s.pids && s.pids.length > 0 ? s.pids.join(', ') : 'なし'}</p>
          ${s.error ? `<p style="color: var(--warning); font-size: 0.8rem;">⚠️ ${s.error}</p>` : ''}
          <div class="btn-group">
            ${actionButtons}
          </div>
        `;
        serviceGrid.appendChild(card);
      }
    }

    async function triggerAction(action, service = '') {
      setControlsDisabled(true);
      actionLogContent = `Action '${action}' ${service ? `for service '${service}' ` : ''}executing...`;
      if (activeService === 'manager') {
        logOutput.textContent = actionLogContent;
      }
      try {
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, service })
        });
        const data = await res.json();
        actionLogContent = data.output || `Action '${action}' completed.`;
        if (activeService === 'manager') {
          logOutput.textContent = actionLogContent;
        }
        await fetchStatus();
        if (activeService !== 'manager') {
          await fetchLogs();
        }
      } catch (err) {
        actionLogContent = "Error executing action: " + err;
        if (activeService === 'manager') {
          logOutput.textContent = actionLogContent;
        }
      } finally {
        setControlsDisabled(false);
      }
    }

    async function loadConfig() {
      try {
        const res = await fetch('/api/config');
        const data = await res.json();
        configEditor.value = JSON.stringify(data, null, 2);
      } catch (err) {
        actionLogContent = "Error loading config: " + err;
        if (activeService === 'manager') {
          logOutput.textContent = actionLogContent;
        }
      }
    }

    async function saveConfig() {
      try {
        const parsed = JSON.parse(configEditor.value);
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });
        const data = await res.json();
        actionLogContent = data.message || "Config saved.";
        if (activeService === 'manager') {
          logOutput.textContent = actionLogContent;
        }
      } catch (err) {
        actionLogContent = "Invalid JSON or save failed: " + err;
        if (activeService === 'manager') {
          logOutput.textContent = actionLogContent;
        }
      }
    }

    // Initialize
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      lanUrlSpan.textContent = `LAN: http://${window.location.host}`;
    }
    async function scheduleStatusPolling() {
      await fetchStatus();
      setTimeout(scheduleStatusPolling, 5000);
    }
    scheduleStatusPolling();
    loadConfig();
    fetchLogs();
    setInterval(() => {
      if (autoRefreshLog && autoRefreshLog.checked && activeService !== 'manager') {
        fetchLogs();
      }
    }, 2000);
  </script>
</body>
</html>
"""

class ManagerHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format: str, *args):
        # アクセスログ・エラーログを web_manager.log に漏れなく出力
        message = "%s - - [%s] %s" % (
            self.address_string(),
            self.log_date_time_string(),
            format % args
        )
        _logger.info(message)

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        global _last_status_cache, _last_status_time
        if self.path == "/api/status":
            with _status_lock:
                now = time.time()
                # 2秒以内の直近キャッシュがあれば再利用
                if _last_status_cache is not None and (now - _last_status_time) < 2.0:
                    self._send_json(_last_status_cache)
                    return

                data = server_status.get_server_status(CONFIG_FILE)
                _last_status_cache = data
                _last_status_time = time.time()
                self._send_json(data)

        elif self.path == "/api/config":
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    self._send_json(json.load(f))
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
        elif self.path.startswith("/api/logs"):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            service = params.get("service", ["backend"])[0].lower()
            tail_str = params.get("tail", ["200"])[0]
            try:
                tail = max(10, min(1000, int(tail_str)))
            except ValueError:
                tail = 200

            service_file_map = {
                "backend": "backend.log",
                "be": "backend.log",
                "frontend": "frontend.log",
                "fe": "frontend.log",
                "comfy": "comfy.log",
                "wsl": "comfy.log",
                "manager": "web_manager.log"
            }

            filename = service_file_map.get(service)
            if not filename:
                self._send_json({"error": f"Unknown service: {service}"}, status=400)
                return

            exists, content, total_lines = read_log_file(filename, tail)
            self._send_json({
                "service": service,
                "filename": filename,
                "exists": exists,
                "lines": total_lines,
                "content": content
            })
        else:
            body = HTML_TEMPLATE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def do_POST(self):
        if self.path == "/api/action":
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            action = payload.get("action", "status")
            service = payload.get("service", "")
            cmd = ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", str(PS_SCRIPT), "-Action", action]
            if action in ["start", "restart", "reboot-service"]:
                cmd.append("-Background")
            if service:
                cmd += ["-Service", service]
            timeout = get_action_timeout(action, service)
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW, timeout=timeout)
                self._send_json({
                    "status": "ok",
                    "action": action,
                    "output": (res.stdout or "") + (res.stderr or "")
                })
            except subprocess.TimeoutExpired:
                self._send_json({
                    "status": "timeout",
                    "action": action,
                    "error": f"Action '{action}' timed out after {timeout}s"
                }, status=504)
        elif self.path == "/api/config":
            try:
                length = int(self.headers.get("Content-Length", 0))
                new_config = json.loads(self.rfile.read(length).decode("utf-8"))
                # バックアップ作成
                if CONFIG_FILE.exists():
                    with open(CONFIG_FILE.with_suffix(".json.bak"), "w", encoding="utf-8") as f:
                        with open(CONFIG_FILE, "r", encoding="utf-8") as cur:
                            f.write(cur.read())
                with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(new_config, f, ensure_ascii=False, indent=2)
                self._send_json({"status": "ok", "message": "Config saved successfully"})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    server_address = ("", PORT)
    local_ip = get_local_ip()
    with ThreadedTCPServer(server_address, ManagerHandler) as httpd:
        print(f"Server Manager Web UI running at:")
        print(f"  Local:   http://localhost:{PORT}")
        if local_ip != "127.0.0.1":
            print(f"  Network: http://{local_ip}:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")

if __name__ == "__main__":
    run_server()
