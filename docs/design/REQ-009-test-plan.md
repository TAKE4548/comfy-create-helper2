# PBI-REQ-009 実行可能テスト計画

## 1. 前提条件と自動セットアップ (Pre-flight Check)
テスト実行前に、以下のコマンドを用いて各ポートで必要なサービスが正常に稼働していることを確認します。サービスが起動していない場合は、起動スクリプトを実行するか、テストを一時停止します。

- **ComfyUI 接続確認**:
  ```bash
  python -c "import urllib.request; response = urllib.request.urlopen('http://127.0.0.1:8188/'); print('ComfyUI: OK')"
  ```
- **Backend 接続確認**:
  ```bash
  python -c "import urllib.request; response = urllib.request.urlopen('http://127.0.0.1:8000/health'); print('Backend: OK')"
  ```
- **Frontend ポート確認**:
  ```bash
  netstat -ano | findstr "127.0.0.1:5173" || echo "Frontend is not running on 5173"
  ```

## 2. 自動テスト / API疎通テスト (CLI Verification)
ComfyUI のキューおよび履歴 API が稼働しているかを確認する疎通コマンドを実行します。

### 2.1 ComfyUI キューエンドポイント疎通確認
- **コマンド**:
  ```bash
  python -c "
  import urllib.request, json
  try:
      response = urllib.request.urlopen('http://127.0.0.1:8188/queue')
      data = json.loads(response.read().decode())
      assert 'queue_running' in data and 'queue_pending' in data
      print('PASS: ComfyUI /queue is responsive.')
  except Exception as e:
      print('FAIL: /queue endpoint failed check:', e)
  "
  ```
- **期待値**: `PASS: ComfyUI /queue is responsive.` が出力されること（FAIL が出た場合は失敗）。

### 2.2 ComfyUI 履歴エンドポイント疎通確認
- **コマンド**:
  ```bash
  python -c "
  import urllib.request, json
  try:
      response = urllib.request.urlopen('http://127.0.0.1:8188/history')
      data = json.loads(response.read().decode())
      print('PASS: ComfyUI /history is responsive.')
  except Exception as e:
      print('FAIL: /history endpoint failed check:', e)
  "
  ```
- **期待値**: `PASS: ComfyUI /history is responsive.` が出力されること（FAIL が出た場合は失敗）。

## 3. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  ```bash
  # 変数 GLOBAL_SCRIPTS は .agents/context.md で定義された値を使用
  python %GLOBAL_SCRIPTS%\artifact_linter.py docs/backlog
  ```
- **期待値**:
  出力に含まれる `<status>` タグの値が `PASS` であること（FAIL の場合は失敗）。

## 4. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173`
- **確認手順と確認事項 (Assertions)**:

### 4.1 AC-1 検証: 画面遷移時の状態維持と他セッション進捗
1. `http://localhost:5173` にアクセスし、任意のワークフローを選択する。
2. 同時に、別ブラウザ（シークレットウィンドウ等、異なる `clientId` を持つセッション）を開き、同じURLにアクセスする。
3. 一方のブラウザで「Generate Batch」をクリックし、画像生成を開始する。
4. **Assertion 1-1**: もう一方のブラウザ（他セッション）で「全セッションの進捗を表示」がアクティブな場合、画面上に他セッションが実行中である旨と進捗状況（プログレスバー）がリアルタイムに表示されること。**（表示されない場合は FAIL と判定）**
5. 生成中に左サイドバーから「LoRAs」画面または「Tags」画面をクリックして遷移し、数秒待機した後に再び「Generate」をクリックして生成画面に戻る。
6. **Assertion 1-2**: プログレスバーが途切れることなく進行し、プレビュー表示が正常に継続・更新されていること。**（途切れやクリアが発生した場合は FAIL と判定）**

### 4.2 AC-2 検証: ブラウザリロード時の復帰とセッションフィルタリング
1. 「Generate Batch」をクリックして画像生成を開始する。
2. 生成の途中でブラウザをリロード（F5）する。
3. **Assertion 2-1**: リロード完了後、WebSocket が自動的に再確立され、リロード前と同じクライアントIDで再接続されること。また、進行中ジョブの進捗率や処理中ノード、プレビュー画像が自動復旧すること。**（復旧しない場合は FAIL と判定）**
4. 生成完了後、サムネイルストリップに生成された画像が表示されていることを確認する。
5. 「自セッションのみ表示」トグルスイッチを ON / OFF 切り替える。
6. **Assertion 2-2**: トグルスイッチが ON の場合、自身のセッションで生成された画像のみがサムネイルストリップに表示されること。トグルスイッチが OFF の場合、他セッションの履歴画像も表示されること。**（フィルタリングが効かない場合は FAIL と判定）**

### 4.3 AC-3 検証: 切断中に完了した画像の回収
1. 「Generate Batch」をクリックして画像生成を開始する。
2. 生成中に一時的にブラウザのタブを閉じるか、またはフロントエンド開発サーバーを一時的に停止する。
3. ComfyUI 側で生成が完了するのに十分な時間（例: 10秒〜20秒）待機する。
4. 再度 `http://localhost:5173` にアクセスする。
5. **Assertion 3**: 切断中に完了した画像の最終出力が ComfyUI の `/history` から取得され、生成画面のメインプレビューおよび履歴サムネイルストリップに自動的に追加・反映されること。**（自動回収されない場合は FAIL と判定）**
