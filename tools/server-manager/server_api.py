import http.server
import json
import os
import socket
import socketserver
import subprocess
import sys
from pathlib import Path

# pythonw.exe などの非コンソール環境下での NoneType クラッシュを防止
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_FILE = SCRIPT_DIR / "config.json"
PS_SCRIPT = SCRIPT_DIR / "server-manager.ps1"
PORT = 8899

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
      <h2 class="section-title">実行ログ</h2>
      <pre id="log-output">待機中...</pre>
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

    function setControlsDisabled(disabled) {
      const buttons = document.querySelectorAll('button');
      buttons.forEach(btn => {
        btn.disabled = disabled;
      });
    }

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        renderServices(data);
      } catch (err) {
        logOutput.textContent = "Error fetching status: " + err;
      }
    }

    function renderServices(status) {
      serviceGrid.innerHTML = '';
      for (const [key, s] of Object.entries(status)) {
        const isRunning = s.running;
        const badgeClass = isRunning ? 'badge-running' : 'badge-stopped';
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <h2>
            <span>${s.name}</span>
            <span class="status-badge ${badgeClass}">${s.status}</span>
          </h2>
          <p>ポート: <strong>${s.port}</strong></p>
          <p class="pids">PID: ${s.pids && s.pids.length > 0 ? s.pids.join(', ') : 'なし'}</p>
          <div class="btn-group">
            ${!isRunning ? `<button class="btn-success" onclick="triggerAction('start', '${key}')">起動</button>` : ''}
            ${isRunning ? `<button class="btn-danger" onclick="triggerAction('stop', '${key}')">停止</button>` : ''}
            <button class="btn-secondary" onclick="triggerAction('reboot-service', '${key}')">再起動</button>
          </div>
        `;
        serviceGrid.appendChild(card);
      }
    }

    async function triggerAction(action, service = '') {
      setControlsDisabled(true);
      logOutput.textContent = `Action '${action}' ${service ? `for service '${service}' ` : ''}executing...`;
      try {
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, service })
        });
        const data = await res.json();
        logOutput.textContent = data.output || `Action '${action}' completed.`;
        await fetchStatus();
      } catch (err) {
        logOutput.textContent = "Error executing action: " + err;
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
        logOutput.textContent = "Error loading config: " + err;
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
        logOutput.textContent = data.message || "Config saved.";
      } catch (err) {
        logOutput.textContent = "Invalid JSON or save failed: " + err;
      }
    }

    // Initialize
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      lanUrlSpan.textContent = `LAN: http://${window.location.host}`;
    }
    fetchStatus();
    loadConfig();
    setInterval(fetchStatus, 5000);
  </script>
</body>
</html>
"""

class ManagerHandler(http.server.BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/status":
            res = subprocess.run(
                ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", str(PS_SCRIPT), "-Action", "status", "-Json"],
                capture_output=True, text=True
            )
            try:
                self._send_json(json.loads(res.stdout.strip() or "{}"))
            except Exception:
                self._send_json({"error": "Failed to parse status", "raw": res.stdout, "stderr": res.stderr}, status=500)
        elif self.path == "/api/config":
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    self._send_json(json.load(f))
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)
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
            res = subprocess.run(cmd, capture_output=True, text=True)
            self._send_json({
                "status": "ok",
                "action": action,
                "output": (res.stdout or "") + (res.stderr or "")
            })
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
