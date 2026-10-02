# REQ-310 実行可能テスト計画: 設定画面における FuguMT プロバイダ統合

## 1. 自動テスト (CLI Verification)

### 1-1. 静的型検査 (Gate 1 Baseline)
- **フロントエンド型チェック**:
  ```bash
  cd frontend; npm run typecheck
  ```
  - **期待値**: エラー 0 件（Exit code 0）。`TranslateTestRequest.provider` に `'fugumt'` が追加され、`TranslationSettingsSection.tsx` の state・props 型整合性が保たれていること。
- **バックエンド型チェック**:
  ```bash
  mypy backend
  ```
  - **期待値**: エラー 0 件（Exit code 0）。

### 1-2. 単体テスト (Gate 2 Baseline)
- **フロントエンド設定画面コンポーネントテスト**:
  ```bash
  cd frontend; npx vitest run src/pages/SettingsPage/components/__tests__/TranslationSettingsSection.test.tsx
  ```
  - **検証項目**:
    1. `renders FuguMT option with 推奨 (CPU) badge`: 翻訳プロバイダーの選択肢に「FuguMT」および「推奨 (CPU)」バッジが正常にレンダリングされること（AC-1）。
    2. `hides API key and URL inputs when FuguMT is selected`: FuguMT 選択時に API キー入力欄およびカスタム URL 入力欄が非表示となり、オフライン案内メッセージが表示されること（AC-2）。
    3. `saves translation_provider as fugumt without apiKey or apiUrl`: FuguMT 選択状態で「設定を保存」を押下した際、`llmPromptsApi.update` が `'translation_provider'` のみ `{ content: 'fugumt' }` で呼び出され、`translation_api_key` や `translation_api_url` は更新呼び出しに含まれないこと（AC-2）。
    4. `executes connection test with provider: fugumt`: FuguMT 選択状態で「疎通テスト」ボタンを押下した際、`translateApi.testConnection` に `{ provider: 'fugumt' }`（apiKey, apiUrl なし）が渡され、成功レスポンスがUIに反映されること（AC-3）。
    5. `loads initial state correctly when translation_provider is fugumt`: DB に `translation_provider = 'fugumt'` が保存されている場合、初回ロード時に FuguMT ラジオボタンが選択状態となること。

- **バックエンド翻訳プロキシ・サービス単体テスト**:
  ```bash
  backend\.venv\Scripts\python -m pytest backend/tests/test_fugumt_service.py
  backend\.venv\Scripts\python -m pytest backend/tests/test_translation_proxy.py
  ```
  - **検証項目**:
    1. `test_initialize_auto_download_success`: モデルディレクトリ未配置時に `snapshot_download` が実行され、自動配置後に正常に初期化（`initialize() == True`）されること（AC-3 前提）。
    2. `test_initialize_auto_download_failure`: 自動ダウンロード失敗時（オフライン・通信エラー等）にクラッシュせず安全に `False` を返し、推論時に `RuntimeError` が送出されること。
    3. `test_initialize_auto_download_disabled`: `auto_download=False` の場合、ダウンロードを試行せず即時 `False` を返すこと。
    4. `test_connection_service_fugumt`: `provider="fugumt"` での疎通テストが正常に成功し、サンプル翻訳が返却されること（AC-3）。
    5. `test_translation_settings_default_fugumt`: 設定未指定時のデフォルトプロバイダーが `"fugumt"` であること。
    6. `test_router_models_fugumt_validation`: `TranslateTestRequest` および `PromptTranslateRequest` が `provider="fugumt"` を正しく受け付けること。
    7. `test_translate_prompt_fugumt`: FuguMT 経由でのプロンプト翻訳推論およびキャッシュ動作。


### 1-3. 全体テストスイート回帰確認 (Gate 2 Full Discovery Run)
- **フロントエンド全体テスト**:
  ```bash
  cd frontend; npm test
  ```
  - **期待値**: 全テストスイート PASS（0 failures）。
- **バックエンド全体テスト**:
  ```bash
  backend\.venv\Scripts\python -m pytest
  ```
  - **期待値**: 全テストスイート PASS（0 failures）。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2-1. シナリオ検証手順

1. **シナリオ 1: 設定画面での FuguMT 選択肢と推奨バッジ表示 (AC-1)**
   - **事前条件**: バックエンドおよびフロントエンドが稼働中。
   - **操作手順**:
     1. ブラウザで `http://localhost:5173/settings`（Settings ページ）を開く。
     2. 「Translation Settings (翻訳設定)」アコーディオンを展開する。
   - **期待値**:
     - 翻訳プロバイダー選択肢に「FuguMT」カードが表示されていること。
     - 緑色基調の「推奨 (CPU)」バッジが付与されていること。
     - 説明文に「CPU 常駐の staka/fugumt-en-ja (int8)。20〜30ms の超高速和訳。VRAM 0MB・API キー不要。」が表示されていること。

2. **シナリオ 2: FuguMT 選択時の入力欄非表示および設定保存 (AC-2)**
   - **操作手順**:
     1. 「FuguMT」ラジオカードをクリックして選択する。
     2. 入力欄エリアを確認する。
     3. 「設定を保存」ボタンをクリックする。
   - **期待値**:
     - DeepL / Google Cloud 用の API キー入力欄およびカスタム URL 入力欄が非表示になること。
     - 画面上部に「保存完了」メッセージが表示されること。
     - SQLite DB の `llm_prompts` テーブルで `key = 'translation_provider'` の `content` が `'fugumt'` に更新されていること。
     - `translation_api_key` や `translation_api_url` が不要に上書き・送信されていないこと。

3. **シナリオ 3: FuguMT 接続テストの実行 (AC-3)**
   - **操作手順**:
     1. FuguMT を選択した状態で「疎通テスト」ボタンをクリックする。
   - **期待値**:
     - ボタン内にスピナーが表示され「テスト中...」となること。
     - `POST /api/translate/test` に `{ "provider": "fugumt" }` が送信されること。
     - テスト成功バナーが表示され、「サンプル翻訳結果: 『1人の女の子、美しい空』」（またはモデル生成訳）が表示されること。

4. **シナリオ 4: 設定保存後の Generate 画面での超低遅延 FuguMT 和訳ルーティング (AC-4)**
   - **操作手順**:
     1. FuguMT を保存した状態で Generate ページ（`http://localhost:5173/`）に移動する。
     2. プロンプト入力欄またはタグチップエディタでタグ（例: `beautiful sunset`）の和訳を実行する。
   - **期待値**:
     - LM Studio への HTTP リクエストや VRAM ロードが一切発生しないこと。
     - FuguMT サービスにより 100ms 以内（平均 20〜30ms）で即座に日本語訳カードまたはプレビューが表示されること。

---

## 3. Red Teaming (境界値・異常系検証)

### 3-1. 境界値・異常系テストケース

- **RT-1: FuguMT モデルディレクトリ未配置・ロード失敗時のエラーハンドリング (AC-3 境界検証)**
  - **テスト手順**:
    1. 環境変数 `FUGUMT_MODEL_DIR` に存在しないパス（例: `nonexistent_dir`）を指定、またはモデルディレクトリを一時的にリネームしてテスト環境を起動。
    2. 設定画面で FuguMT を選択し「疎通テスト」ボタンを押下。
  - **期待値**:
    - バックエンドはクラッシュせず、`500 Internal Server Error` または `TranslateTestResponse(success=False, error="FuguMT engine is not available")` を安全に返却すること。
    - UI に「疎通テスト失敗」赤色バナーが表示され、エラー内容が明瞭に伝達されること。白画面化やハングアップが絶対に発生しないこと。

- **RT-2: クラウドプロバイダ（API Key設定済）から FuguMT への切り替えと保存 (データ保全性)**
  - **テスト手順**:
    1. 一旦「DeepL」を選択し、APIキー（`test-deepl-key`）を入力して保存。
    2. その後「FuguMT」を選択し、「設定を保存」ボタンを押下。
  - **期待値**:
    - FuguMT 保存時に `translation_provider = 'fugumt'` のみが更新されること。
    - DB 上の既存の `translation_api_key` が空文字や null で意図せず上書き消去されず、将来ユーザーが DeepL に戻した際に入力キーが復旧可能であること。

- **RT-3: 「疎通テスト」ボタンの急激な連続クリック (連打耐性・デバウンス)**
  - **テスト手順**:
    1. 「疎通テスト」ボタンを素早く 5 回連続でクリックする。
  - **期待値**:
    - `isTesting` フラグによりボタンが即時 `disabled` 状態となり、多重リクエストやレースコンディションが発生しないこと。
    - 最初のリクエストの完了に伴い正常に結果が1件のみ表示されること。

- **RT-4: ネットワーク完全切断状態でのローカル和訳検証 (オフライン耐性)**
  - **テスト手順**:
    1. PC の外部ネットワーク（Wi-Fi / Ethernet）を切断、またはブラウザをオフラインモードに設定。
    2. 設定画面で FuguMT の疎通テストを実行し、続いて Generate 画面でタグ和訳を実行。
  - **期待値**:
    - 外部 API への通信を試行せず、ローカル CPU 内で完結して正常に翻訳結果が返却されること（外部 API タイムアウトが発生しないこと）。

- **RT-5: DB 内のレガシー / 異常値プロバイダーからのフォールバック**
  - **テスト手順**:
    1. DB 内の `translation_provider` が `'google_free'` や未定義値になっている状態で設定画面をロード。
  - **期待値**:
    - `'google_free'` は `'google_cloud'` へフォールバックし、未定義時はデフォルト値（または `'fugumt'`）へ安全に解決され、コンポーネントがクラッシュしないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **BA Audit**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py ba-audit`
- **QA Audit**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py qa-audit docs/design/REQ-310-test-plan.md`
- **Pre-commit Linter**: `python ${GLOBAL_SCRIPTS}/pre_commit_linter.py`

