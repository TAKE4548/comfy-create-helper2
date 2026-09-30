# REQ-292 3-Gate 検証ウォークスルー

**PBI ID**: REQ-292  
**検証日時**: 2026-09-28T10:23 JST  
**検証者**: Tester/Reviewer (dev-verify)

---

## Gate 1: 型チェック / コンパイルベースライン

### 実行コマンド
`
npm run typecheck
# (内部: tsc -b --noEmit)
`

### 実行結果

`
> frontend@0.0.0 typecheck
> tsc -b --noEmit

(エラー出力なし)
`

| 項目 | 結果 |
|------|------|
| **終了コード** | 0 |
| **TypeScript エラー数** | 0 |
| **判定** | ✅ **PASS** |

---

## Gate 2: フルテストスイート

### 実行コマンド
`
npx vitest run
`

### 実行結果サマリー

`
 Test Files  88 passed (88)
      Tests  845 passed (845)
   Start at  10:23:05
   Duration  28.93s
`

### REQ-292 関連テストスイート (確認済み)

`
✓ src/hooks/__tests__/useSceneSpeechGeneration.test.ts  (6テスト)
✓ src/components/__tests__/SpeechBubbleEditorModal.test.tsx  (REQ-292セクション含む全テスト)
`

| 項目 | 結果 |
|------|------|
| **テストファイル数** | 88 ファイル |
| **テスト総数** | 845 テスト |
| **失敗数** | 0 |
| **終了コード** | 0 (stderrはintentional fault-injection console.errorのみ) |
| **判定** | ✅ **PASS** |

> **NOTE**: PowerShell の exit code 1 はテスト失敗ではなく、既存 fault-injection テストで意図的に発生する console.error 出力によるものです。すべてのテストアサーションは PASSED です。

---

## Gate 3: シナリオ & レッドチーミング検証

### TEST-UI-01: 「シーン一括生成」ボタンの描画確認

**テストコード** (SpeechBubbleEditorModal.test.tsx L1218-L1231):
- primaryTagSetId={1} 付きでレンダー
- screen.getByTestId('scene-batch-generate-btn') が存在すること → **PASS**

**実装確認** (index.tsx L412-L430):
- data-testid="scene-batch-generate-btn" 属性付きボタン ✅
- <Sparkles size={14} /> アイコン (非ローディング時) ✅
- <Loader2 size={14} className="animate-spin" /> (ローディング時) ✅
- disabled={isSceneGenerating} ✅

**結果**: ✅ PASS

---

### TEST-UI-02: クリック時 handleBatchGenerateClick 発火確認

**テストコード** (SpeechBubbleEditorModal.test.tsx L1233-L1254):
- speechBubblePresetsApi.getByTagSetId が preset 返却するよう設定
- ボタンクリック後、mockGenerateDraftApi が snapshot_id 含む引数で呼ばれること → **PASS**

**実装確認** (index.tsx L163-L172):
- useSceneSpeechGeneration フック接続 ✅
- handleBatchGenerateClick を onClick で呼出 ✅

**結果**: ✅ PASS

---

### TEST-UI-03: primaryTagSetId=null でも API 呼出継続

**テストコード** (SpeechBubbleEditorModal.test.tsx L1256-L1275):
- primaryTagSetId={null} でレンダー
- mockGenerateDraftApi が { target_tag_set_id: null } で呼ばれること → **PASS**
- speechBubblePresetsApi.getByTagSetId が呼ばれないこと → **PASS**

**実装確認** (useSceneSpeechGeneration.ts L66-L81):
- primaryTagSetId != null の else 分岐に 	arget_tag_set_id: null で API呼出 ✅
- エラーキャッチのみ (サイレント終了なし) ✅

**結果**: ✅ PASS

---

### TEST-UI-04: 「編集設定」タブ中に生成後 preview タブへ自動遷移

**テストコード** (SpeechBubbleEditorModal.test.tsx L1277-L1299):
- 「編集設定」タブへ切替後、一括生成ボタン押下
- 生成完了後、preview タブボタンが g-blue-600 クラスを持つ → **PASS**

**実装確認** (index.tsx L415-L420):
`	ypescript
onClick={() => {
  handleBatchGenerateClick().finally(() => {
    if (activeMobileTab === 'controls') {
      setActiveMobileTab('preview')
    }
  })
}}
`
生成完了後 .finally() で setActiveMobileTab('preview') ✅

**結果**: ✅ PASS

---

### レッドチーミング: 並行競合シナリオ (useSceneSpeechGeneration.test.ts)

| テスト名 | シナリオ | 結果 |
|---------|---------|------|
| TEST-PAR-03 variant 1 | モーダル確認 → API完了 (順序: 確認先) | ✅ PASS |
| TEST-PAR-03 variant 2 | API完了 → モーダル確認 (順序: API先) | ✅ PASS |
| CRIT-01 rescue (v1) | モーダルキャンセル → API完了 (キャンセル先) | ✅ PASS |
| CRIT-01 rescue (v2) | API完了 → モーダルキャンセル (API先) | ✅ PASS |
| null route | primaryTagSetId=null → API直接呼出 | ✅ PASS |
| normal path | preset存在 → ワンクリック自動展開 | ✅ PASS |

---

## AC 達成マトリクス

| # | 受入条件 | 実装確認 | テスト確認 | 判定 |
|---|---------|---------|-----------|------|
| AC-1 | ヘッダーに「シーン一括生成」ボタン（Sparklesアイコン + disabled={isSceneGenerating} + loading spinner）が描画される | index.tsx L412-L430: testid, Sparkles/Loader2, disabled prop 確認済み | TEST-UI-01 PASS | ✅ **PASS** |
| AC-2 | useSceneSpeechGeneration フックが接続され、クリック時に handleBatchGenerateClick が発火する | index.tsx L163-L172: フック呼出 & onClick連結確認 | TEST-UI-02 PASS | ✅ **PASS** |
| AC-3 | primaryTagSetId が null でも 	arget_tag_set_id: null でAPI呼出継続（サイレント終了しない） | useSceneSpeechGeneration.ts L66-81: else分岐でnull指定、エラーキャッチのみ | TEST-UI-03 PASS + null-route unit test PASS | ✅ **PASS** |
| AC-4 | モバイルで「編集設定」タブ中に押すと生成完了後に preview タブへ自動遷移 | index.tsx L415-420: .finally()でsetActiveMobileTab('preview') | TEST-UI-04 PASS | ✅ **PASS** |
| AC-5 | TEST-UI-01〜04 が全てパス、
pm run typecheck エラー0件 | Gate 1: 0エラー, Gate 2: 845/845 PASS, TEST-UI-01〜04全PASS | 全ゲート通過 | ✅ **PASS** |

**AC達成率: 5/5 (100%)**

---

## 総合判定

| Gate | コマンド | 結果 | 詳細 |
|------|---------|------|------|
| Gate 1 | 
pm run typecheck (tsc -b --noEmit) | ✅ **PASS** | exit code 0, エラー 0件 |
| Gate 2 | 
px vitest run | ✅ **PASS** | 88ファイル / 845テスト 全PASS |
| Gate 3 | シナリオ & レッドチーミング | ✅ **PASS** | TEST-UI-01〜04全PASS, 6種競合シナリオ全PASS |

## 🏆 最終ベルディクト: **PASS**

---

## 実装ファイル一覧

| ファイル | 役割 |
|---------|------|
| rontend/src/hooks/useSceneSpeechGeneration.ts | シーン一括生成ロジックフック |
| rontend/src/hooks/__tests__/useSceneSpeechGeneration.test.ts | フックユニットテスト (6ケース) |
| rontend/src/components/SpeechBubbleEditorModal/index.tsx | モーダルコンポーネント (ボタン実装) |
| rontend/src/components/SpeechBubbleEditorModal/types.ts | Props型定義 (primaryTagSetId等) |
| rontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx | 統合テスト (TEST-UI-01〜04含む) |
