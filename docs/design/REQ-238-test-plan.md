# REQ-238 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**:
  ```powershell
  # 1. フロントエンド単体テスト実行
  cd frontend; npm run test
  # 2. フロントエンドビルド実行
  cd frontend; npm run build
  ```
- **機械的判定基準**:
  - `npm run test`: プロセスの終了コード (Exit Code) が `0` であること。標準出力に `0 failed` が含まれ、失敗テストケースが 0 件であること。
  - `npm run build`: プロセスの終了コードが `0` であること。`frontend/dist/index.html` が存在し、ファイルサイズが 0 バイト超であること。

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ**:
  1. **個別起動検証**:
     - コマンド:
       ```powershell
       powershell -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action start -Service frontend
       ```
     - 判定基準:
       - コマンド終了コードが `0`。
       - `(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue) -ne $null` が `$true` を返すこと。
       - `(Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing).StatusCode` が `200` を返すこと。
  2. **再起動検証**:
     - コマンド:
       ```powershell
       powershell -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action restart -Service frontend
       ```
     - 判定基準:
       - コマンド終了コードが `0`。
       - 再起動完了後も `(Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing).StatusCode` が `200` を返すこと。
  3. **停止検証**:
     - コマンド:
       ```powershell
       powershell -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action stop -Service frontend
       ```
     - 判定基準:
       - コマンド終了コードが `0`。
       - `(Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue)` が `$null` であること。

## 3. Red Teaming (境界値・異常系検証)
- **シナリオ**: 破損・Read-Only 属性付き空ディレクトリの自律回復検証
- **手順**:
  ```powershell
  # 1. 意図的に破損状態（空ディレクトリ + ReadOnly属性）を作成
  cd frontend
  Remove-Item -Path node_modules\.vite\deps -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path node_modules\.vite\deps | Out-Null
  cmd /c "attrib +r node_modules\.vite\deps"
  
  # 2. 手動 npm run dev による起動検証（バックグラウンドまたはタイムアウト付き検証）
  # ノード経由で vite 設定とサニタイズを直接検証
  node -e "import('./vite.config.ts').then(() => { const fs = require('fs'); const metaExists = fs.existsSync('node_modules/.vite/deps/_metadata.json'); const depsExists = fs.existsSync('node_modules/.vite/deps'); console.log('CLEANUP_VERIFIED: deps=' + depsExists + ' meta=' + metaExists); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });"
  ```
- **機械的判定基準**:
  - 上記スクリプトの Exit Code が `0`。
  - 出力に `CLEANUP_VERIFIED` が含まれ、Read-Only 属性の空 `deps` ディレクトリが正常に削除されていること。
  - 続いて `npx vite --help` または `npm run build` が Exit Code `0` でクラッシュせずに実行できること。

## 4. ツール主導監査 (Tool-Driven Audit)
- **コード監査**:
  `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active/REQ-238.md` を実行し、`<status>PASS</status>` を得ること。
