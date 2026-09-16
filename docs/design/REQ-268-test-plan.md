# REQ-268 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 Git Ignore 動作確認
- **コマンド**:
  ```powershell
  git check-ignore db/thumbnails/test.png
  git check-ignore scratch/test.txt
  git check-ignore tools/server-manager/test.bak
  ```
- **期待値**:
  - 全てのコマンドで除外ルール（`db/thumbnails/`, `scratch/`, `*.bak`）に一致するパスが出力され、Exit Code 0 で終了すること。

### 1.2 既存システムの無影響検証 (Regression Baseline)
- **コマンド**:
  ```powershell
  pytest backend/tests/ -q
  ```
- **期待値**:
  - レガシードキュメント削除・移動後もバックエンドの全テストが正常にパスすること（0 failures）。

---

## 2. 結合・E2E・シナリオ検証 (Scenario Verification)

### 2.1 Git ワーキングツリーのクリーン度確認
- **検証手順**:
  1. `git status -s` を実行する。
- **期待値**:
  - `db/thumbnails/` が `??`（未追跡）として表示されないこと。
  - `scratch/` が `??`（未追跡）として表示されないこと。
  - `SettingsPopover (1).tsx` などのゴミファイルが存在しないこと。

### 2.2 ディレクトリ階層とSSoT整合性確認
- **検証手順**:
  1. リポジトリ root に `Prompt Surgeon FEデザイン・実装仕様書.md`, `api_spec_draft.md`, `spec_and_migration.md` が存在しないこと。
  2. `docs/archive/legacy_specs/` に移行済み旧仕様書が格納されていること。
  3. `docs/archive/reports/` に過去レポートが格納されていること。
  4. `docs/specs/` 配下の正本（`SPEC_*.md`）が欠落なく保持されていること。
  5. `tmp/` 内の不要滞留ファイルがパージされていること。

### 2.3 Red Teaming (境界値・異常系検証)
- **シナリオ 1: 新規キャッシュ生成時の Git 追跡漏れ防止**:
  - `touch db/thumbnails/new_cache_image.webp` を実行後、`git status -s` を確認。
  - **期待値**: `git status` に `db/thumbnails/new_cache_image.webp` が一切現れないこと（Git による追跡漏れが確実に遮断されていること）。
  - （検証後、ダミーファイルを削除）
- **シナリオ 2: SSoT 重要仕様の誤削除防止ガード**:
  - `test -f docs/specs/SPEC_COMMON.md` および `test -f docs/specs/SPEC_SUMMARY.md` を確認。
  - **期待値**: 正本ファイルがすべて存在し、サイズが正常であること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  - `python ${GLOBAL_SCRIPTS}\backlog_linter.py`
  - `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog`
- **期待値**: すべて PASS。
