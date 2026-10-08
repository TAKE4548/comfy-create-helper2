# REQ-331 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `cd frontend; npm test`
- **期待値**: 全テスト PASS (Exit code 0)。脳内推論代用は厳禁。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: パラメータ表示・編集・セクション開閉 (AC-1, AC-6)
- **手順**:
  1. Dataset Studio (Step 1) でワークフローを選択。
  2. 生成パラメータセクションが展開され、共用 ParamPanel 部品により Steps, CFG, Sampler 等の入力欄が表示されることを確認。
  3. Steps を 20 から 28 に変更し、CFG を 7.0 から 6.5 に変更。
  4. 各セクションの折り畳みトグルをクリックし、スムーズにアコーディオンが開閉することを確認。
- **期待結果**: 入力値が正常に保持され、UI が崩れず操作できること。

### シナリオ 2: ノードバイパス設定と保存 (AC-2)
- **手順**:
  1. Step 1 のバイパス設定ボタンをクリックし、共通 BypassSettingsModal を開く。
  2. FaceDetailer ノードをバイパス（無効化）に切り替えて保存。
- **期待結果**: モーダルが閉じ、Studio 状態にバイパス設定が保持されること。

### シナリオ 3: ホワイトリスト方式ノードリマッピング (AC-3)
- **手順**:
  1. ノード再割当ボタンをクリックし、NodeRemapModal を開く。
  2. 汎用 textarea プロンプトロールが除外され、Positive/Negative 注入先および各種パラメータロールが表示されていることを確認。
  3. Sampler ノードの割り当てを変更して「保存」をクリック。
- **期待結果**: workflowsApi.update が発行され、ワークフローマッピングが正常に更新されること。

### シナリオ 4: ComfyUI バッチ20件直接投入への反映 (AC-4)
- **手順**:
  1. パラメータ（Steps=28, CFG=6.5）およびバイパス（FaceDetailer無効化）を設定。
  2. 「ComfyUIに20件直接投入」をクリック。
- **期待結果**: comfyApi.queuePrompt が 20 回呼び出され、全20件のペイロードに Steps=28, CFG=6.5、および該当ノードの mode=2 (Bypass) が注入されていること。

### シナリオ 5: プロジェクト状態の復元 (AC-5)
- **手順**:
  1. パラメータとバイパスを設定後、ブラウザをリロードまたはプロジェクトを再表示。
- **期待結果**: オートセーブおよび sessionStorage 下書きからパラメータ値とバイパス状態が完全復元されること。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### Red Team 1: 存在しないノードへのバイパス指定・パラメータ注入の安全性
- **手順**: 外部でノードが削除されたワークフローに対して、旧設定のバイパスIDまたはパラメータキーを投入。
- **期待結果**: クラッシュせず、存在しないノードへのアクセスは安全にスキップされること。

### Red Team 2: 数値パラメータの境界外・型不整合フォールバック
- **手順**: Steps や CFG に極端な異常値（NaN、負の数、文字列）が混入した場合の挙動。
- **期待結果**: 型変換ガードにより安全なデフォルト値へフォールバックし、ComfyUI への不正ペイロード送信を阻止すること。

### Red Team 3: クォータ超過時の sessionStorage 例外安全
- **手順**: sessionStorage.setItem が QuotaExceededError を送出する状況。
- **期待結果**: 画面がクラッシュせず、メモリ上の状態とサーバーオートセーブで継続動作すること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **監査コマンド**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py ba-audit --target docs/design/REQ-331.md`
- **VRAM解放**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py unload`