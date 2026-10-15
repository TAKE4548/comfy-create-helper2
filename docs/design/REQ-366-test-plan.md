# REQ-366 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック & 構文監査 (Typecheck & Static Linter Baseline)
- **コマンド**:
  ```bash
  backend\.venv\Scripts\python scripts/verify_ui_invariants.py
  backend\.venv\Scripts\mypy backend
  cd frontend && npm run typecheck
  ```
- **期待値**: 型エラー 0 件、UI不変条件違反 0 件 (Exit code 0)

### Gate 2: ユニット＆ガバナンス結合テスト (Unit / Full Suite Baseline)
- **コマンド**:
  ```bash
  backend\.venv\Scripts\python -m pytest backend/tests/governance/test_ui_invariants.py
  backend\.venv\Scripts\python scripts/verify_test_naming.py --strict
  ```
- **期待値**: 全テスト PASS (Exit code 0)。テスト命名規約厳格適合。

---

## 2. 結合・受入検証 (Integration & Acceptance Verification)

### 2-1. Test Placement Plan [MUST [W-DD-PLACE]]
- **対象テストファイル**: `backend/tests/governance/test_ui_invariants.py`
  - チケット名を含まないガバナンス層テストに配置。
- **命名規則**: `[REQ-366/AC-n]` プレフィックスを全テストケースに付与。

### 2-2. Seam Map [MUST [W-DD-SEAM]]
- **Integrated (本物のコード)**:
  - `scripts/verify_ui_invariants.py` の全ロジック（ファイル走査、コメント抽出、CSS/TSXルール検証、CLI実行）。
- **Severed (切断対象)**:
  - Zero-GPU, Zero-Network: 外部ネットワーク、ブラウザ、WebSocket、DB依存なし。
- **Mock Level**:
  - 内部実装のモンキーパッチ禁止。`tmp_path` 内の実ファイルおよび文字列解析エンジンを直接実行。
- **PBT Decision**:
  - 入力境界値（複数行コメント、クォート混在、インライン除外形式）のテーブル駆動テスト。
- **Fault Injection**:
  - 禁止構文（生100vh、!important乱用、文字サイズ底上げ）を注入し、検出失敗・Exit code 1を検証。

### 2-3. 各受入基準 (AC) の検証シナリオ
- **AC-1 (SSoT 仕様書 & 4大プリセット検証)**:
  - コマンド: `python -c "content=open('docs/specs/SPEC_COMMON.md', encoding='utf-8').read(); assert '1-5. UI/UX アンチパターンカタログ' in content; assert 'Global Font Floor' in content; assert '4大コンポーネントプリセット' in content; assert 'before:absolute before:-inset-2' in content; print('AC-1: PASS')"`
  - 期待値: SPEC_COMMON.md にモバイル10選・PC8選・4大コンポーネントプリセット（Tailwind具体構文 `before:absolute before:-inset-2` や `touch-action: pan-y / manipulation` 含む）・重要情報の非省略ルールが存在すること。
- **AC-2 (コンテキスト不変条件 & プリセット参照検証)**:
  - コマンド: `python -c "content=open('.agents/context.md', encoding='utf-8').read(); assert 'UI 6大ハード不変条件' in content; assert '4大コンポーネントプリセット' in content; assert 'SPEC_COMMON.md' in content; print('AC-2: PASS')"`
  - 期待値: .agents/context.md に6大不変条件が300〜500トークン以内で簡潔に定義され、4大プリセットへのマッピング及びSSoTポインタが存在すること。
- **AC-3 (アーキタイプ分類 & サージカル自動挿入規約)**:
  - コマンド: `python -c "content=open('docs/design/REQ-366.md', encoding='utf-8').read(); assert 'アーキタイプ分類' in content; assert 'before:absolute before:-inset-2' in content; content_gov=open('.agents/rules/governance.md', encoding='utf-8').read(); assert 'Archetype 1: Modals & Overlays' in content_gov; print('AC-3: PASS')"`
  - 期待値: Architectによる4大アーキタイプ分類および該当プリセットのみをフロントエンドTask Cardにサージカル注入する規約が設計書およびガバナンスに明文化されていること。
- **AC-4 (Gate 1 即死検証スクリプト & 例外機構)**:
  - コマンド: `backend\.venv\Scripts\python -m pytest backend/tests/governance/test_ui_invariants.py -k "REQ-366 and AC-4"`
  - 期待値: 全テスト PASS (Exit code 0)。
- **AC-5 (バックエンドタスク汚染防止検証)**:
  - コマンド: `python -c "content_gov=open('.agents/rules/governance.md', encoding='utf-8').read(); assert 'subsystem: backend' in content_gov; assert 'コンテキスト汚染ゼロ' in content_gov; print('AC-5: PASS')"`
  - 期待値: バックエンド専用タスクにUIアンチパターン制約を含めないコンテキスト汚染防止規約が確立されていること。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### シナリオ RT-1: グローバル文字底上げ（Global Font Floor）の即死検出
- **手順**: テスト用一時ファイルに `body { font-size: 11px; }` または `[class~='text-[8px]'] { font-size: 11px; }` を記述し `verify_ui_invariants.py` を実行する。
- **期待結果**: Exit code 1 で即座に終了し、`rule-no-global-font-floor` 違反と該当行番号を出力すること。

### シナリオ RT-2: 生 100vh 単位の即死検出
- **手順**: テスト用一時ファイルに `height: 100vh;` または Tailwind の `h-[100vh]` を記述し `verify_ui_invariants.py` を実行する。
- **期待結果**: Exit code 1 で即座に終了し、`rule-no-raw-100vh` 違反を出力すること。

### シナリオ RT-3: !important 乱用の即死検出と正当なコメント除外の通過
- **手順**:
  1. `color: red !important;` を記述して実行 → Exit code 1 で検出。
  2. 直前または同一行に `/* ui-invariant-ignore: rule-no-indiscriminate-important reason: legacy third-party override */` を付与して実行 → Exit code 0 でパス。
- **期待結果**: コメントなしでは即死、正当な理由付きコメントがあれば例外許可されること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-366-test-plan.md`
- **実行権限**: Codex環境下では LM Studio localhost/API と `lms` CLI のアクセスが必要なため、最初から昇格sandbox実行を使用する（`sandbox_permissions=require_escalated`）。
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`

