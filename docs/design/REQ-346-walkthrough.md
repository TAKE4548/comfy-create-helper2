# REQ-346 コード受け入れ検証 walkthrough (dev-verify)

検証者: tester-reviewer / 検証日: 2026-10-16 / 対象: 作業ツリー現状 (frontend のみ) / 範囲: AC-1..6, AC-8 (AC-7 は doc-reviewer が別判定。本書では閉じない)
前提決定: A4 ホバーカードは対象内、AC-6 は設計 R4 の読み (同一レイアウト内は開いたまま、768px 境界跨ぎは閉じて開き直しで到達)、ヘッダー下端アンカー決定(a)有効。

## 総合判定: FAIL (Gate 2 の退行 2 件)

Gate 1 は PASS、Gate 3 は PASS だが、Gate 2 (全スイート) で既存テスト 2 件が失敗した。原因は本 PBI の変更 (展開パネルの body 直下ポータル化) による既存契約テストの未更新で、再現性がある。機能面の AC 証跡は揃っているが、全スイート 0 失敗の基準を満たさないため PASS としない。

<execution_evidence>

### Gate 1: 静的検証 PASS
- `cd frontend; npm run typecheck` (tsc -b --noEmit): exit 0、エラー 0。ログ: `docs/design/REQ-346-verify-gate1-typecheck.log`
- `backend/.venv/Scripts/python scripts/verify_ui_invariants.py`: exit 0、`0 violations across 535 files`。ログ: `REQ-346-verify-ui-invariants.log`
- `backend/.venv/Scripts/python scripts/verify_test_naming.py --strict`: exit 1、`Test naming violations: 4` / `File path violations: 0`。違反 4 件は REQ-346 に起因しない (ログ中の REQ-346 言及 0 件、指摘は未変更の既存ファイル群)。チケット名ファイルなし。ログ: `REQ-346-verify-test-naming.log`。ベースライン上の既存違反であり REQ-346 は増やしていないと判断するが、変更前との差分比較は未実施 (制約参照)。
- `workflow_validator.py test-hygiene REQ-346`: `[PASS] No ticket-named test files found. Validation successful.` TEST_ACCRETION_VIOLATION なし。

### Gate 2: 全スイート FAIL
- `cd frontend; npx vitest run --reporter=dot` (フィルタなし): exit 1。Test Files 238 passed / 1 failed (239)、Tests 2411 passed / 2 failed (2413)。所要 76s。ログ: `REQ-346-verify-gate2-vitest.log`
- 失敗 (いずれも `src/pages/GeneratePage/__tests__/GeneratePage.test.tsx`、当該ファイルは未変更):
  1. `[REQ-112/AC-2] toggles workflow actions menu when workflow actions button is clicked` (L222: `container.querySelector('[role="menu"]')` が null)
  2. `[REQ-112/AC-6] workflow actions menu contains workflow management items` (L267-269: `container.querySelector('#workflow-actions-rename')` 等が null)
- 再現性: 当該ファイル単体再実行でも同じ 2 件が失敗 (2 failed | 16 passed)。フレークではない。
- 原因分析: A1 のメニューが `HeaderDropdown` により `body` 直下へポータル描画されるようになり (REQ-346 の本質的な設計)、`render()` の `container` 配下を検索する既存 2 ケースが見つけられなくなった。実機能の不具合ではなくテストの追随漏れだが、T3 (WorkflowActionsMenu 移行) の影響範囲確認で GeneratePage 統合テストが拾われていない。修正方針の例: 当該 2 ケースを `screen` / `document.body` 基準の検索へ更新 (意図保存)。ソース・テストは読み取り専用のため本検証では修正していない。

### Gate 3: 実ブラウザ・シナリオ PASS (Vite を自分で 5173 に起動し終了後に停止)
- 全 E2E: `cd frontend; npx playwright test --reporter=line`: exit 0、251 passed / 30 skipped / 0 failed (281)。ログ: `REQ-346-verify-gate3-playwright-full.log`。既存 `settingsResponsive.spec.ts` (REQ-365 等)、`stickyHeader.spec.ts` も含み退行なし。
- 個別: `headerMenuOverlay.spec.ts` 154 passed + 30 skipped、`headerMenuRoutes.spec.ts` 25 passed、`headerHoverCard.spec.ts` 22 passed。計 201 passed。ログ: `REQ-346-verify-gate3-{headerMenuOverlay,headerMenuRoutes,headerHoverCard}.log`
- skip 30 件の内容: `headerMenuOverlay.spec.ts:90` の `test.skip(a.maxWidth !== undefined && v.w > a.maxWidth, 'pill is mobile-only')`。A3 (VRAM ピル、<640px のみ) を 640px 以上の幅で意図的に除外する条件付きスキップ (検証対象外幅) であり、AC の未検証ではない。
- Vite 停止: PID 50712 の子プロセスツリーを taskkill、`netstat` で 5173 が LISTENING でないことを確認 (port free)。

### QA 監査 (ローカルモデル)
- 実行: `local_model_adapter.py --context-length 32768 --timeout 600 qa-audit docs/design/REQ-346-test-plan.md` (モデル `qwen/qwen3.5-9b`、reasoning は既定 none)。exit 0、トレース `Action=qa-audit | Model=qwen/qwen3.5-9b | Params=9.0B | Quant=Q6_K`。生出力: `REQ-346-verify-qa-audit.log`
- 即時 unload: `local_model_adapter.py unload` exit 0、`lms ps` = `No models are currently loaded.`
- 生の判定: **REJECT - Revision Required** (Critical Flaws Detected)。qa_audit_result は COMPLIANT ではない。指摘は以下。
  - A: Tier2 (vitest/jsdom) と Tier3 の境界が矛盾し、Tier2 失敗の言い逃れが可能 (severity: モデル評価 High)。
  - B: AC-8 の検証が実ルートに無く「将来」扱いで回避可能 (High)。
  - C: ±1px の許容がコード例で固定されていない (Medium)。
  - D: 768px 境界の閉鎖判定のタイミングが不明確 (Medium)。
  - E: `-g "REQ-346/AC-n"` がテスト名に一致する保証なし (Medium)。
  - F: Vite 起動待機が計画に無い (Low)。
- 検証者によるトリアージ案 (未決。最終判断は coordinator): A は設計 §1 の意図 (jsdom は DOM イベント経路、幾何は Tier3) の誤読が主で実害は低い。B はハーネス上の 40 項目で実際に検証済み (後述) で回避は起きていない。C は実 E2E が `toBeLessThanOrEqual(1)` を使用。E はタグ付きテスト名を実在確認 (Playwright ログのタイトルに `[REQ-346/AC-n]`)。D は T8 が境界跨ぎで `[role="menu"]` 0 件を判定。F は計画に待機記述が無いのは事実 (低リスク改善提案)。指摘は破棄せず coordinator へ保存する。
</execution_evidence>

## 受け入れ基準マトリクス (AC-1..6, AC-8)

| AC | 実装機能の証跡 | 判定 |
|---|---|---|
| AC-1 下端がヘッダー下端より下 | E2E: ハーネス全アクション(A1 workflow, A2 kebab, A3 pill, future)×全幅で上端=ヘッダー下端+6px(±1)、下端>ヘッダー下端、ヘッダー/scrollHeight 不変。実ルート T8: Generate 各幅、ピル折り返しヘッダー、スクロール追従。A4 は headerHoverCard と T8 700x900 で上端=ヘッダー下端+6px。Vitest: 配置 PBT・HeaderDropdown・各メニュー単体。 | PASS (機能) |
| AC-2 ヘッダー下の項目を押せる | E2E: 項目クリックでイベント発火 (workflow rename、kebab 再同期、pill 閉じる) とクリック位置>ヘッダー下端を assert。T8 で名前変更の実行と閉鎖。A4 は読み替え(カード内移動で閉じない)を実ポインターで検証。 | PASS (機能)。ただし GeneratePage 統合の REQ-112/AC-2 が退行 (Gate 2) |
| AC-3 末尾へスクロール到達 | E2E: 高さ360/280で future は scrollHeight>clientHeight を assert のうえ末尾を `click({trial})` と `elementFromPoint` で確認、workflow は到達のみ。T8 375x360。A4 は maxHeight 約100pxで実ホイールスクロール。 | PASS (機能) |
| AC-4 再押下で閉じる | E2E: トリガー再押下・外側クリックで閉鎖、T8 で連続トグル、10 回連打で孤立パネルなし。A4 は離脱・外側押下の読み替え。 | PASS (機能) |
| AC-5 desktop/tablet/mobile で隠れず到達 | E2E: 8 幅×3 アクションで `elementFromPoint` がパネル (z10/z40 背景に隠れない)、固定ボトムナビ・プリセットタブ非被覆(T8)、A4 は Generate Desktop でタブバー非被覆と 639 以下で非表示。 | PASS (機能) |
| AC-6 resize 後も到達 | E2E: ハーネスで 1280x800→375x360 を開いたまま上端追従と末尾到達。T8 は R4 の 2 区分 (同一レイアウト内は開いたまま末尾押下可、768px 跨ぎは閉じて開き直しで末尾押下可)。ピルは 640px で閉鎖。A4 はホバー中 resize 再計測。 | PASS (機能) |
| AC-8 将来アクション検証例 | ハーネス `FutureTallAction` (40 項目、実 `HeaderDropdown` + 実 `PageHeader` を使用) が全幅で末尾 (`future-39`) まで到達し実クリックでイベント発火。Vitest 統合 (unifiedHeaderIntegration) でも `.overflow-x-auto` 外描画と末尾存在を確認。 | PASS (機能) |
| AC-7 | 対象外 (doc-reviewer) | 未判定 (本書で閉じない) |

A1〜A4 の個別カバレッジ: 全アクション×AC-1〜6 が Tier2 とハーネス E2E で個別に存在 (A1/A2/A3 はハーネス全幅、A1 は実ルート、A4 は専用 headerHoverCard 22 件と T8)。A2 と A3 の実ルート E2E は一部のみ (A2: AC-1/AC-5 の Generate 1280、A3: AC-1/AC-5 のモバイル)。AC-2/AC-3 の実ルート個別はハーネス (実コンポーネント使用) で補完されており、重大な欠落ではないが実ルートでの個別網羅は薄い。

テスト真正性レビュー: 検証した E2E は `elementFromPoint`、`click({trial:true})`、bbox 数値(±1px)、押し広げ前後の scrollHeight 比較、実ホイール/実ポインター移動を使い、存在確認のみのトートロジーではない。配置計算は fast-check PBT。ハーネスは実コンポーネントを組み込み内部モックなし。ただし本検証は主要箇所の抜粋確認であり全行精読ではない。

## Red Team / 境界の確認結果
- resize: 同一レイアウト内維持、768px 跨ぎで閉鎖、連続 resize、ピル 640px 閉鎖はいずれも E2E で PASS。
- 96px 閉鎖閾値: 純関数 PBT (境界 228/227 を含む) と範囲外高さ 280 (サポート外) のハーネスを確認。実ブラウザで高さ280でも末尾到達の PASS。
- 折り返しヘッダー: Generate 700x900 でヘッダー下端+6px とブリッジによるポインター継続を PASS (隙間 74.75px)。
- リスナー/孤立パネル: 連続トグル10回、A4 hover 出入り10回、A4 を開いたままケバブを開くで body 直下パネルが最大1つ (PASS)。StrictMode 二重マウントは Vitest 側 (全スイートで失敗なし)。
- z-order: harness-tabs z10 / harness-progress z40 と実 Generate のプリセットタブバーに対し `elementFromPoint` で非被覆を確認。

## 副作用
- `verify_test_naming.py` 実行で `docs/design/REQ-356-test-mapping.md` が書き換えられる旨の出力 (`[Mapping Baseline Updated]`) が出たが、実行前後の sha256 は同一 (`ccbd6a54...790ea`)。内容変化なし。同ファイルは本 PBI 前から modified 状態であり、REQ-346 のコミットに含めないこと。
- 追加した成果物のみ: `docs/design/REQ-346-walkthrough.md` と `docs/design/REQ-346-verify-*.log` (gate1/gate2/gate3 3 spec+full/ui-invariants/test-naming/qa-audit/unload/vite)。ソース・PBI・カード・仕様書は未編集。Playwright が生成するテスト成果物ディレクトリ (test-results 等) の有無は未確認。
- Vite は停止済み、5173 解放確認済み。LM Studio モデルは unload 済み (`lms ps` で空)。コミット・archive は未実施。

## 制限事項
- Chromium のみ (playwright 設定)。他ブラウザ、iOS Safari、ブラウザズーム、キーボード操作は範囲外。
- 実機タッチの emulated hover は未検証。
- `verify_test_naming.py --strict` の 4 違反が本変更前から存在するかは、変更前ツリーとの比較をしていない (読み取り専用制約のため)。ログ上 REQ-346 関連の指摘はない。
- backend スイートは範囲外のため未実行。
- test-hygiene 以外のエンコーディング/シークレット検査はコミット前チェックに属し未実施。

## 再検証に必要な是正
1. `GeneratePage.test.tsx` の `[REQ-112/AC-2]` と `[REQ-112/AC-6]` を、ポータル先 (`document.body` / `screen`) で検索するよう意図保存で更新する。
2. 修正後に Gate 2 (`npx vitest run` 全体) を再実行し 0 失敗を確認する。Gate 1 の再実行と、Gate 3 は GeneratePage テストのみの変更なら再実行不要と考えるが、最終判断は coordinator。
3. 他に同様の `container.querySelector` 依存が無いことは今回の全スイート結果 (上記 2 件以外は全 PASS) で確認済み。

## 返却ペイロード

```json
{
  "pbi_id": "REQ-346",
  "verdict": "FAIL",
  "gate_results": {
    "gate_1_typecheck": "PASS (tsc -b --noEmit 0 errors; verify_ui_invariants 0 violations; verify_test_naming --strict exit 1 with 4 pre-existing naming violations, none attributable to REQ-346; test-hygiene PASS)",
    "gate_2_full_test_suite": "FAIL (vitest run: 2411 passed / 2 failed of 2413; GeneratePage.test.tsx REQ-112/AC-2 and AC-6, portal regression)",
    "gate_3_scenarios": "PASS (playwright full 251 passed / 30 conditional skips / 0 failed; REQ-346 specs 201 passed)"
  },
  "qa_audit_result": "REJECT (raw verdict from qwen/qwen3.5-9b, ctx 32768; executed and unloaded; triage by coordinator pending)",
  "audit_findings": ["A Tier2/Tier3 boundary ambiguity", "B AC-8 harness-only escape", "C +-1px template", "D 768px close timing", "E -g name match", "F Vite wait"],
  "walkthrough_path": "docs/design/REQ-346-walkthrough.md",
  "failure_details": "2 existing GeneratePage integration tests query the menu via render container but the menu is now portaled to body; update tests and re-run Gate 2"
}
```

---

## 再検証 (2026-10-16)

### 1. 差分レビュー
- `git diff` 対象: `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` のみ (8 行追加 / 8 行削除)。
- 変更内容は `[REQ-112/AC-2]` と `[REQ-112/AC-6]` の `container.querySelector` を `document.body.querySelector` に置換し、未使用となった `const { container } =` を除去しただけ。
- 期待値 (`not.toBeInTheDocument` / `toBeInTheDocument`、3 つの `#workflow-actions-*` 項目、`ワークフロー個別設定` テキスト) は不変。アサーションの弱体化なし、意図保存。
- 本番コード不変の確認: 初回 Gate 3 ログ (`REQ-346-verify-gate3-playwright-full.log`, 08:47:42) より新しい mtime を持つファイルを `frontend/src`, `frontend/e2e`, 設定ファイルで検索した結果、該当は上記テストファイル 1 件のみ。

### 2. Gate 結果
| Gate | コマンド | 結果 | ログ |
| :--- | :--- | :--- | :--- |
| Gate 1 | `cd frontend; npm run typecheck` (`tsc -b --noEmit`) | exit 0, 0 errors | `REQ-346-verify-regate1-typecheck.log` |
| Gate 1 | `backend/.venv/Scripts/python scripts/verify_ui_invariants.py` | exit 0, 0 violations / 535 files | `REQ-346-verify-regate1-ui-invariants.log` |
| Gate 2 | `cd frontend; npx vitest run` (フィルタなし) | exit 0, 239 files passed, 2413 tests passed / 0 failed | `REQ-346-verify-regate2-vitest.log` |
| Gate 3 | Playwright 再実行なし (下記根拠) | 初回結果を継承: 251 passed / 30 条件付 skip / 0 failed | `REQ-346-verify-gate3-playwright-full.log` |

Gate 3 を再実行しない根拠: 変更は jsdom 単体テスト 1 ファイルのみで、本番コードおよび e2e/設定ファイルは初回 Playwright 実行後に未変更 (mtime 検索で確認)。ブラウザ挙動に影響する差分が存在しないため、Vite 起動を伴う再実行は不要と判断した (Vite は起動していない)。

### 3. 最終 AC マトリクス (コード)
| AC | 判定 | 根拠 |
| :--- | :--- | :--- |
| AC-1 | PASS | Gate 1/2 再実行 PASS + 初回 Gate 3 (e2e) |
| AC-2 | PASS | 同上 |
| AC-3 | PASS | 同上 |
| AC-4 | PASS | 同上 |
| AC-5 | PASS | 同上 |
| AC-6 | PASS | 同上 (REQ-112/AC-2, AC-6 回帰も解消) |
| AC-7 | 範囲外 | doc-reviewer が別途クローズ |
| AC-8 | PASS (制約付き) | 初回 Gate 3 の結果を継承。QA 監査 finding B (ハーネス限定の逃げ道) は coordinator 判断事項 |

### 4. QA 監査
初回結果 (REJECT, findings A-F, 生出力 `REQ-346-verify-qa-audit.log`、unload 確認済み) をそのまま維持し再実行していない。finding の triage は引き続き coordinator の所掌。

### 5. 残存する制約
- backend スイートは範囲外で未実行。
- `verify_test_naming --strict` の既存命名違反 4 件 (REQ-346 起因ではない) は未解消のまま。
- エンコーディング/シークレット検査はコミット前チェックとして未実施。
- `docs/design/REQ-356-test-mapping.md` は本 PBI 前から modified 状態であり、REQ-346 のコミットに含めないこと。
- コミット/アーカイブ/状態更新は未実施 (coordinator 所掌)。
