# REQ-278: テスト計画書 (Test Plan) - 根本原因是正＆クリーンアップ検証版 (第2版: QA Audit反映)

- **PBI**: REQ-278
- **改訂日**: 2026-09-19
- **作成者**: Architect / QA
- **ステータス**: テスト計画策定完了 (QA Audit PASS / BVT規則統合版)

---

## 1. 検証ゲート概要 (3-Gate Baseline)

### Gate 1: 静的解析・型チェック
- **フロントエンド**: `npx tsc -p tsconfig.app.json --noEmit`
  - 判定基準: 0 errors
- **バックエンド**: 構文チェック
  - 判定基準: 0 errors

### Gate 2: フルテストスイート自動ディスカバリ実行
- **フロントエンド**: `npm test` (Vitest ディスカバリ実行)
  - 対象: `usePresetState.test.ts`, `useGenerateAction.test.ts`, `useGeneratePageState.test.tsx`, `multiSetSlice.test.ts` を含む全テストスイート
  - 判定基準: 0 failures (全テスト PASS)

### Gate 3: 結合シナリオ & 実機5大現象再発防止検証 (True Positive Verification)
- **判定基準**:
  - `usePresetState` の `rawMappedSets` において、`existingSet?.paramValues` がサーバー DB 値で破棄されず最優先で継承されること。
  - `useEffect` の `currentActiveSetId` フォールバックにより、単一セット時にセット全体が初期化されないこと。
  - `queuePrompt(wfJson, metadata)` の第1引数 `wfJson` の各ノード inputs に、リロードなしで最新パラメータが確実に注入されること。

---

## 2. 抜け道防止および偽陽性排除ルール (Anti-Loophole Rules)

静的解析レポート（`tmp/REQ-276_277_Static_Analysis_Report.pdf`）およびローカルモデル QA 監査で指摘されたテストギャップを完全に遮断する：

| ルール ID | 名称 | 必須条件 | 遮断する抜け道 |
|---|---|---|---|
| **AL-1** | **手動代入バイパスの禁止** | テスト内で `mockStore.sets[0].paramValues = { ... }` のように手動でストア内部状態を直接差し替えることを禁止し、必ず `usePresetState` のマッピングロジックまたはストアアクションを経由すること。 | `useEffect` が走って `sets` を旧値で上書きする現象をバイパスする抜け道 |
| **AL-2** | **再同期サイクル結合検証** | プリセット取得（`presets`）の変更・再評価が発生した状況下で、ローカル編集値が保持されることを検証する。タイムアウトは 3000ms を上限とし、決定論的アサーションを実施。 | オートセーブ完了後の React Query 再同期による巻き戻りを見落とす抜け道 |
| **AL-3** | **初期値乖離の機械的バイナリアサート** | テスト入力値は、ワークフロー初期値およびサーバー DB 値と完全に異なる値を指定し、`actual === expected && actual !== initialDB && actual !== default` のバイナリ判定（boolean true）をアサートする。 | フォールバックによる偽陽性 PASS を防止 |
| **AL-4** | **対症療法コード削除後の健全性** | `useGenerateAction.ts` 内の肥大化した対症療法パッチを整理した後も、単一セット・複数セットの生成が正常に動作することを検証する。 | クリーンアップによるリグレッションの防止 |

---

## 3. 機械的検証強制規則 (Mechanical Verification Enforcement: Anti-"Brain Test")

AI エージェントによる「脳内テスト（自己申告のみの合格）」や主観的解釈による偽陽性を防ぐため、以下の BVT ルールを厳格に適用する：

- **Rule BVT-1 (Binary Output Enforcement)**: すべてのアサーションは Vitest / CI パイプライン上で機械的な PASS / FAIL 結果を出力すること。主観的なコード閲覧のみによる検証完了報告は不可。
- **Rule BVT-2 (Diff Comparison Assertion)**: 期待値と実測値の差分を厳密に比較する。
  ```typescript
  const expectedValue = '35';
  const actualValue = rawMappedSets[0].paramValues.Sampler_Steps;
  const isCorrect = actualValue === expectedValue &&
                    actualValue !== initialDBValue &&
                    actualValue !== fallbackDefault;
  expect(isCorrect).toBe(true);
  ```
- **Rule BVT-3 (Preconditions Checklist)**: 各統合テスト実行前に、初期ストア状態（`sets`, `activeSetId`, `presets`）が明示的にセットアップされていることを前提条件として検証すること。

---

## 4. 統合シナリオテスト (Integration Scenarios)

### シナリオ 1: `rawMappedSets` によるローカル編集値（`paramValues`）の優先継承検証 [AL-1, AL-2, AL-3, BVT-2]
- **前提条件**:
  - `defaultParams`: `{ Sampler_Steps: '20', Sampler_cfg: '7.0' }`
  - サーバー DB 値: `{ Sampler_Steps: '20', Sampler_cfg: '7.0' }`
  - インメモリ編集値: `{ Sampler_Steps: '35', Sampler_cfg: '6.0' }`
- **手順**:
  1. 既存のセット `existingSet` をストアに展開。
  2. サーバーから DB 値を持つ `presets` が渡され、マッピングを実行。
- **検証アサーション**:
  - `actualSteps === '35' && actualSteps !== '20'` が `true`
  - `actualCfg === '6.0' && actualCfg !== '7.0'` が `true`

### シナリオ 2: 単一セット運用時における `currentActiveSetId` 解決とインメモリ保持検証 [AL-1, AL-2]
- **前提条件**: `sets.length === 1` かつ `activeSetId === null`
- **手順**:
  1. ユーザーがパラメータを変更。
  2. `presets` の再フェッチ契機で `usePresetState` のメイン `useEffect` が発火。
- **検証アサーション**:
  - `currentActiveSetId` が `existingSets[0].id` へフォールバックされ、`mappedSets` が `rawMappedSets` で初期化・上書きされずに最新状態が維持されること。

### シナリオ 3: リロードなし即時生成時の `wfJson` ノード入力値検証 [AL-3, AL-4, BVT-1]
- **手順**:
  1. 画面上でパラメータを変更（Steps: 20 -> 40, CFG: 7.0 -> 8.5）。
  2. F5 リロードを行わず、オートセーブが走る前または走った直後に `handleGenerateSets` を実行。
- **検証アサーション**:
  - `queuePrompt` の第1引数 `wfJson['3'].inputs.steps === 40`
  - `queuePrompt` の第1引数 `wfJson['3'].inputs.cfg === 8.5`

---

## 5. Red Teaming (境界値・異常系・5大現象検証)

### RT-1: 編集・生成・再編集の連続サイクルテスト（静的レポート第5現象の防止）
- **内容**: 生成後に再度パラメータを変更（40 -> 50）して再度生成を実行した際、リロードを挟まなくても 2 回目の生成が正しく `50` で投入されること。

### RT-2: `useGenerateAction` クリーンアップ後の単一チェック・複数チェック境界値検証
- **内容**: 肥大化した対症療法パッチを整理した後、単一セット時、複数セット時（特定セットのみチェック）、全セットチェック時のそれぞれで意図通りのパラメータがマージ・投入されること。

### RT-3: プロンプトとパラメータの対称性検証
- **内容**: プロンプト（`promptChips`）と一般パラメータ（`paramValues`）を同時に変更してリロードなしで生成した際、両方が 100% 確実に同時に反映されること。
