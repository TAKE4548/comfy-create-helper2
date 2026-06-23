# PBI-REQ-072 実行可能テスト計画 (監査済み版)

## 1. 自動テスト (CLI Verification)
- **コマンド**:
  ```bash
  cd frontend
  npm run lint > lint_output.log 2>&1 && echo "Lint: PASS" || echo "Lint: FAIL"
  npm run build --silent && echo "Build: PASS" || echo "Build: FAIL"
  ```
- **期待値**: 
  - `Lint: PASS` と `Build: PASS` の両方がコンソールに出力され、エラー（Exit Code != 0）が起きないこと。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py arch-audit docs/backlog/task/active/REQ-072.md > audit_log.txt
  ```
- **期待値**: 
  - `audit_log.txt` 内にエラーや例外ログがなく、正常終了していること。

## 3. ブラウザ検証 (Browser Agent Verification)
ローカル開発サーバー `http://localhost:5173/history` を起動し、以下の動作を手動またはブラウザエージェントで検証します。

### 3.1 単一画像ダウンロード (アルバム詳細画面)
- **検証手順**:
  1. アルバム詳細画面で任意の画像カードにホバーする。
  2. 新設されたダウンロードボタン（lucide-reactのDownloadアイコン）をクリックする。
- **判定基準 (Assertion)**:
  - ブラウザのダウンロード履歴に画像ファイルが追加され、ファイルサイズが0より大きいこと。

### 3.2 履歴（Snapshots）一覧画面・一括ダウンロード (ZIP)
- **検証手順**:
  1. 履歴画面で任意の画像2つ以上を選択し、複数選択モードに入る。
  2. 上部ツールバー（`MultiSelectToolbar`）の「一括ダウンロード」ボタンをクリックする。
- **判定基準 (Assertion)**:
  - ダウンロードされたZIPファイル名が `YYYYMMDD_HHmmss.zip` 形式（例：`20260623_160823.zip`）であること。
  - ZIPを展開した中身のファイル数が、選択した画像数と一致し、それぞれ画像ファイルとして正常に開けること。

### 3.3 アルバム詳細画面・一括ダウンロード (ZIP)
- **検証手順**:
  1. アルバム詳細画面で「選択モード」を押し、画像2つ以上を選択する。
  2. 上部ツールバーの「一括ダウンロード」ボタンをクリックする。
- **判定基準 (Assertion)**:
  - ダウンロードされたZIPファイル名が `[アルバム名].zip` であること。
  - ZIPを展開した中身のファイル数が、選択した画像数と一致すること。

### 3.4 同名ファイルの重複防止制御
- **検証手順**:
  1. 同名画像（例: `photo.png`）を2つ以上選択して一括ダウンロードを実行する。
  2. ダウンロードされたZIPを展開し、ファイル一覧を確認する。
- **判定基準 (Assertion)**:
  - ファイルが上書きされず、`photo.png`、`photo_1.png` のように連番が付与され、すべての選択画像が欠損なく保存されていること。
