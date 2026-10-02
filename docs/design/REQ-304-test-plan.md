# REQ-304 実行可能テスト計画: FuguMT軽量和訳エンジン導入とドラッガブルタグチップ和訳プレビュー

## 1. 自動テスト (CLI Verification)

### 1-1. 単体テスト (TDD / Unit Tests)

#### A. バックエンド (Backend)
- **コマンド**:
  ```bash
  backend\.venv\Scripts\python -m pytest backend/tests/test_fugumt_service.py
  backend\.venv\Scripts\python -m pytest backend/tests/test_translation_proxy.py
  ```
- **検証項目**:
  - `test_fugumt_service.py`:
    - `FuguMTService` シングルトン取得および遅延初期化。
    - `intra_threads=6`, `device="cpu"` によるスレッドおよびCPU常駐構成。
    - `normalize_input` による前後空白トリムおよび連続スペースの単一化。
    - `translate_batch` でのバッチ推論と特殊トークン処理。
    - モデル不在・ライブラリ不在時の例外ハンドリング（FastAPI未停止）。
  - `test_translation_proxy.py`:
    - `provider="fugumt"` 指定時の `translate_prompt` 実行。
    - 入力正規化後の SHA256 キャッシュキー照会とインメモリキャッシュヒット（2回目即時返却、AC-1）。
    - 複数チャンク内での重複チャンクの集約・未キャッシュチャンクのみの一括翻訳。
    - `provider="google_cloud"`, `"deepl"`, `"llm"` の後方互換性維持。
    - 例外発生時の適切なエラー送出（HTTPException 500 / TranslateTestResponse error）。

#### B. フロントエンド (Frontend)
- **コマンド**:
  ```bash
  cd frontend; npx vitest run src/components/TagChipEditor/__tests__/TagChipTranslationCard.test.tsx
  cd frontend; npx vitest run src/components/TagChipEditor/__tests__/TagChip.test.tsx
  ```
- **検証項目**:
  - `TagChipTranslationCard.test.tsx`:
    - マウント時の `translateApi.translatePrompt` 呼び出しとローディング表示（AC-3）。
    - 翻訳成功時の訳文表示とクリップボードコピー機能・1.5秒フィードバック（AC-3, AC-7）。
    - APIエラー時のエラーメッセージ表示と再試行ボタン動作（AC-4）。
    - ヘッダー部の Pointer Events（`pointerdown`, `pointermove`, `pointerup`）による移動とビューポート境界クランプ（AC-5）。
    - ヘッダーの `touch-action: none` スタイル確認（AC-5）。
    - 本文領域での `pointerdown` 伝播遮断（`stopPropagation`）およびテキスト選択・スクロール独立性（AC-6）。
    - 閉じるボタン [✕]、`Escape` キー押下、外側クリック時の `onClose` 呼び出し（AC-8）。
  - `TagChip.test.tsx`:
    - サブメニュー横幅が `w-[360px] max-w-[calc(100vw-24px)]` クラスを持つことの確認（AC-2）。
    - サブメニューヘッダーに `[翻訳]` ボタンがレンダリングされること（AC-2）。
    - `[翻訳]` ボタンクリックによる和訳カードの開閉トグル（AC-3）。
    - 親サブメニューが閉じた際に和訳カードも連動して閉じること（AC-8）。

### 1-2. 静的型チェック (Typecheck Baseline)
- **コマンド**:
  ```bash
  cd frontend; npm run typecheck
  mypy backend
  ```
- **期待値**: 0 errors。

### 1-3. 全体テストスイート (Full Test Suite Baseline)
- **コマンド**:
  ```bash
  cd frontend; npm test
  backend\.venv\Scripts\python -m pytest
  ```
- **期待値**: 0 failures。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2-1. シナリオ検証パス

1. **シナリオ 1: FuguMT CPU和訳とキャッシュ高速応答 (AC-1)**
   - 条件: バックエンドサーバー起動中。
   - 操作: `POST /api/translate/prompt` に `{ "prompt": "1girl, holding a glowing staff", "provider": "fugumt" }` を送信。
   - 期待値: GPU VRAMを消費することなくCPU推論により日本語訳が返却される。同一テキストを再送信した際、キャッシュヒットにより 0ms 付近で即座に返却される。

2. **シナリオ 2: タグサブメニューの360px拡張と翻訳ボタン (AC-2)**
   - 条件: タグチップエディタにタグ `masterpiece` が存在。
   - 操作: タグチップをクリックしてサブメニューを開く。
   - 期待値: サブメニュー幅が `360px`（モバイルは `calc(100vw - 24px)` 上限）で表示され、タグ名入力欄と並んで `[翻訳]` ボタンが表示される。

3. **シナリオ 3: フローティング和訳カードの表示とローディング/訳文表示 (AC-3)**
   - 条件: タグチップサブメニューが開いている。
   - 操作: `[翻訳]` ボタンをクリック。
   - 期待値: サブメニュー直下にフローティング和訳カードが表示され、取得中は「和訳を取得中...」ローディングが表示され、完了後に日本語訳文が表示される。

4. **シナリオ 4: 翻訳API障害・タイムアウト時のフォールバック表示 (AC-4)**
   - 条件: 翻訳APIでエラーが発生またはネットワークが不通。
   - 操作: `[翻訳]` ボタンをクリック。
   - 期待値: アプリケーションがクラッシュせず、カード内に「和訳の取得に失敗しました」と再試行ボタンが表示される。

5. **シナリオ 5: ヘッダードラッグ・Pointer Events・ビューポートクランプ (AC-5)**
   - 条件: フローティング和訳カードが表示されている。
   - 操作: ヘッダーバーをマウスまたはタッチ操作で上下左右にドラッグし、画面端まで移動させる。
   - 期待値: カードがスムーズに追従し、画面外（上下左右の画面端）を越えて飛び出さず境界で停止（クランプ）する。モバイルで画面背面がスクロールしない。

6. **シナリオ 6: 本文スクロールとドラッグの操作分離・テキスト選択 (AC-6)**
   - 条件: 長文の訳文が表示されている。
   - 操作: 訳文テキスト領域をドラッグしてテキスト選択を行い、縦スクロールを行う。
   - 期待値: カード全体のドラッグ移動が誤発火せず、テキスト選択および縦スクロールが正常に実行できる。

7. **シナリオ 7: 1クリッククリップボードコピーと完了フィードバック (AC-7)**
   - 条件: 和訳カードに日本語訳が表示されている。
   - 操作: カード内のコピーボタンをクリック。
   - 期待値: 訳文がクリップボードにコピーされ、コピーアイコンが一時的にチェックマーク（緑色）に切り替わり、1.5秒後に元に戻る。

8. **シナリオ 8: 複合トリガーによるカードクローズ連動 (AC-8)**
   - 条件: フローティング和訳カードが表示されている。
   - 操作: (a) カード右上の [✕] ボタンをクリック、(b) Escキーを押下、(c) カード外をクリック、(d) 親タグサブメニューを閉じる。
   - 期待値: いずれの操作でもフローティング和訳カードが即座に閉じられる。

---

## 3. Red Teaming (境界値・異常系検証)

### 3-1. 境界値・異常系テストケース

- **RT-1: 極端な長文テキストおよび特殊文字混在プロンプト (Extreme Length & Special Tokens)**
  - 入力値: 1,000文字超の自然文プロンプト、LoRA構文 `<lora:name:0.8>`、重み構文 `(masterpiece:1.2)`、絵文字、改行が混在。
  - 期待値: バックエンドは構文トークンを保護した上でCPUメモリ上限を超えずに推論を完遂し、UIカードは縦スクロール可能領域（`max-h-[160px]`）内に収まりレイアウトが崩壊しないこと。
- **RT-2: ビューポート外への過度なドラッグ移動（境界クランプの死角検証）**
  - 入力値: ポインタ座標を `(-100, -200)` や `(window.innerWidth + 500, window.innerHeight + 500)` など極端な画面外へ高速移動。
  - 期待値: クランプ計算（`Math.max(0, Math.min(newX, innerWidth - cardWidth))`）により、カードが常にビューポート内に留まり、見失われないこと。
- **RT-3: 翻訳APIの500エラー・レスポンス遅延（UI無停止・非同期エラーハンドリング）**
  - 入力値: バックエンドが 500 Internal Server Error を返却、またはリクエストがタイムアウト。
  - 期待値: Reactコンポーネントが例外でアンマウント・白画面化せず、カード内にエラー状態が安全にレンダリングされ、[再試行] ボタンで回復可能であること。
- **RT-4: タッチ端末における急激なドラッグとマルチタッチ（Pointer Capture リーク防止）**
  - 入力値: タッチ開始直後に画面外へスワイプ、または複数指でタップ。
  - 期待値: `setPointerCapture` / `releasePointerCapture` によりポインタイベントが孤立せず、指を離した際にドラッグ状態が確実に解除されること。
- **RT-5: 空白・改行・重複スペースのキャッシュ一貫性 (Whitespace Normalization Cache Invariance)**
  - 入力値: `" 1girl "` と `"1girl"`、および `"red   dress"` と `"red dress"` を連続送信。
  - 期待値: 入力正規化により同一の SHA256 キャッシュキーが生成され、不要な2重推論が発生せずキャッシュから返却されること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **BA Audit**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py ba-audit`
- **QA Audit**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py qa-audit`
- **Pre-commit Linter**: `python ${GLOBAL_SCRIPTS}/pre_commit_linter.py`

