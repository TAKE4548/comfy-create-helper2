# REQ-365 ドキュメント検証レポート r5（最終静的再レビュー）

- 役割: doc-reviewer（doc-verify）。レビュー対象は読み取り専用で、本レポートのみ作成。
- 対象: `docs/specs/SPEC_COMMON.md`（v2.5）、`docs/specs/SPEC_SETTINGS.md`（v3.0）。T23 再同期後の作業ツリー（HEAD 2825d01 + 未コミット差分）。
- 識別: SPEC_COMMON sha256 先頭 2c17e9d17eac30b6 / SPEC_SETTINGS sha256 先頭 bd29ed43056ffb21
- 検証方法: 静的検査（grep / ファイル読取）と推論。実エージェント試行・製品実行・テスト実行は行っていない。

## 総合判定: FAIL（軽微な事実不正確 1 件のみ。修正後は PASS 見込み）

## 指摘（要修正）

### F1 SPEC_COMMON.md 50 行目: 疑似ハンドルの適用範囲が「のみ」と過剰限定
- 記述: 「`index.css` の疑似要素ハンドルは `.modal-backdrop` 直下の `[role='dialog']::before`（`[data-radius-exempt]` を持たないもの）にのみ適用され、…」
- 実コード: `frontend/src/index.css` 347 行（`... > [role='dialog']:not([data-radius-exempt])::before`）に加え、357-383 行に `role="dialog"` を持たない `max-w-md`〜`max-w-7xl` の子要素向けの疑似ハンドル（`::before` 36x4px）が存在する。実際、レガシー `.modal-backdrop` 利用ファイルのうち `role="dialog"` を持つのは LoraDetailModal / LoraRegisterModal 程度で、大半（BulkEdit、CategoryManager、TagSet 系など）は 2 つ目の規則で疑似ハンドルを得る。よって「`[role='dialog']::before` にのみ」は誤り。
- 置換案（50 行目該当文を差し替え）:
  「`index.css` の疑似要素ハンドルは `.modal-backdrop` 直下のレガシーパネルにのみ適用される。対象は (a) `[role='dialog']:not([data-radius-exempt])::before`、および (b) `role="dialog"` を持たない `max-w-md`〜`max-w-7xl` クラスの直下パネルの `::before` の 2 系統である。共通Modal（`data-radius-exempt`）には適用せず、`.modal-backdrop` を使わない独自overlayにも疑似ハンドルは適用されない。」
- 影響: AC-9 の導出（共通Modalは実ハンドル 1 つ）には影響しない。レガシー側の説明精度のみ。

## 検証結果（主張 vs 実コード）

| 項目 | 結果 | 根拠 |
|---|---|---|
| 共通Modal利用一覧（Settings 到達分 11 件） | PASS | `<Modal` 使用: ParamTypeMasterManagerModal / ParamTypeMasterModal / BaseModelSection(3箇所: 202/284/342) / MappingMasterEditModal / StageManagerModal / SpeechToneSection(75) / SettingsComponents(MappingMasterDeleteModal 183, WorkflowDeleteConfirmDialog 384) / WorkflowManageModal / WorkflowNodePicker / WorkflowDiffReplaceModal |
| WorkflowDiffReplaceModal のみ高さ指定なし | PASS | `WorkflowDiffReplaceModal.tsx:146` に sheetMaxHeightClass なし。他 10 件は `max-h-[85dvh]`（grep 一致） |
| レガシー `.modal-backdrop` 直接利用の列挙の網羅性 | PASS | 非テストの grep 結果 19 ファイルが記載と一致（OutfitMasterModal, CreateProjectModal, AddAssetModal, ProfileBulkEdit 本体+ConfirmView 含む）。`useImageNavigation.ts` は querySelector のみで UI ではなく除外妥当。Settings 到達はなし（BypassSettingsModal は Generate/DatasetStudio、UploadWorkflowModal は GeneratePage のみ） |
| WorkflowManageModal の GeneratePage 共有 | PASS | `GeneratePage.tsx:189` と `WorkflowConnectionSection.tsx:806` |
| closeOnEsc ネスト例外 | PASS | `MappingMasterEditModal.tsx:301 closeOnEsc={!isNodePickerOpen}`、WorkflowNodePicker は共通Modal（119 行）。唯一のネスト（他は ParamType の list→form が排他遷移: MappingMasterSection 504-519） |
| 削除ダイアログの role が dialog | PASS | Modal.tsx:140 は固定 `role="dialog"`、alertdialog 非対応 |
| `MappingMasterModal`(SettingsComponents.tsx:54) 非参照 | PASS | 参照はテストのみ。`fixed inset-0` は同ファイル 68 行のみ（Settings 関連で他に無し） |
| 行内 alertdialog はオーバーレイでない | PASS | ServiceConnectionCard:140、SpeechToneSection:367 はいずれも行内 div |
| sheetMaxHeightClass 解釈（単一 `max-h-[v]`、`_`→空白、他は既定） | PASS | `parseSheetMaxHeightValue` 正規表現 `^\s*max-h-\[([^\]\s]+)\]\s*$` と一致。既定値 `calc(100dvh - env(safe-area-inset-top))` 一致 |
| 85dvh は §1-5 プリセット(75/90dvh)の中間値 | PASS | SPEC_COMMON 69・120 行 |
| 角丸16px / `data-radius-exempt` | PASS | Modal.tsx `rounded-t-2xl md:rounded-2xl`, `data-radius-exempt`; index.css 163・171-178 の除外、338 行で 1rem 1rem 0 0 |
| 実ハンドル `data-testid="modal-sheet-handle"` 1 つ | PASS | Modal.tsx（`md:hidden`） |
| index.css L1 セレクタ | PASS（F1 の範囲を除く） | 347 行が `.modal-backdrop:not(.flex-col):not(:fullscreen):has(> [role='dialog']) > [role='dialog']:not([data-radius-exempt])::before` |
| SettingsResponsive.css の dialog max-height 規則が除去済み | PASS | 残る `.req314-settings [role='dialog']` は box-sizing / max-width / overflow のみ（42-46 行）。仕様はこれと矛盾する記述なし |
| Settings 下部余白・AppShell 54px・§2-4 | PASS | SettingsPage.tsx:155、AppShell.tsx:113/118。`--bottom-nav-height` 定義なし |
| タブ短縮ラベル・aria-label は長い表示名 | PASS | SettingsTabBar.tsx 13-17, 55 |
| VRAM 契約（2.0–14.0 clamp、1.0GB 余裕） | PASS | VramGuardSection.tsx 19-24, 17 |
| 不変契約 details-expanded-v2 / API・DB / §1-5 | PASS | キー定義 `localStorageKeys.ts:31`、仕様の `{prompt,dialogue}` 不変。§1-5 の差分は既知例外の追記 1 箇所のみで、85dvh 追記は §1-4 側に留まる |
| 仕様内・仕様間の矛盾 | PASS | SPEC_COMMON §1-4（52-55 行）と SPEC_SETTINGS §3-1-1/§3-2 の列挙・ネスト例外・独自overlay 無しが一致 |
| PBI との整合 | PASS | PBI 41/56 行（ボトムシート・上端16px）。PBI 90 行の「ネスト無し」は ParamType/BaseModel に限定した記述で、仕様の例外（NodePicker）と矛盾しない |

## AC-1..AC-10 導出可能性（静的）

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | PASS | SPEC_SETTINGS §3-1-1（xl 2 カラム、order のみ） |
| AC-2 | PASS | §3 コンパクト表示名・§3-1-1 横スワイプ 44px |
| AC-3 | PASS | §3-1-1 超スリムカード、Target Node は aria-label |
| AC-4 | PASS | §3-2 排他遷移、SPEC_COMMON §1-4 |
| AC-5 | PASS | §3-3 統合型エディタ |
| AC-6 | PASS | §3-4 |
| AC-7 | PASS | §3 systemタブ段落（行ごと死活ランプ・インラインログ） |
| AC-8 | PASS | 同段落（クライアント State 即時反映、HTTP/WS 負荷なし） |
| AC-9 | PASS | SPEC_COMMON §1-3/§1-4（実ハンドル、16px、85dvh、全 Settings モーダル） |
| AC-10 | PASS | SPEC_SETTINGS LocalStorage 契約表 |

## 参照・エンコーディング
- 新規追加の related_paths（REQ-365 PBI、設計、VramGuardSection、ParamTypeMasterManagerModal、MappingMasterEditModal、StageManagerModal、SettingsComponents、WorkflowManageModal、WorkflowNodePicker、SettingsResponsive.css）はすべて存在。テスト計画リンク `REQ-365-test-plan.md` も存在。
- 既存（今回差分外）の古い参照: SPEC_SETTINGS.md 10・12・13 行 `docs/backlog/pbi/active/REQ-314.md` `.../REQ-347.md` `docs/backlog/task/active/REQ-347-T10.md` と 39 行の REQ-347-T10 リンクは archive へ移動済みで実在しない（`pbi/archive/REQ-314.md`、`pbi/archive/REQ-347.md`、`task/archive/REQ-347-T10.md` は存在）。REQ-365 起因ではないが、置換案は `active` を `archive` に置換。ブロッカーとはしない。
- エンコーディング: UTF-8 として有効、BOM なし。ただし両ファイルとも全行 CRLF（HEAD も全行 CRLF で今回新規導入ではない。差分行も CRLF で統一）。「LF」要件を厳密適用するなら既存の CRLF 方針との判断をコーディネータに委ねる（新規劣化なし）。

## 設計書・テスト計画の陳腐化（観察のみ。編集していない）
- `docs/design/REQ-365.md:39`: 「`StageManagerModal` / `MappingMasterEditModal` はレガシー独自overlayのまま段階移行」は現状と不一致。両者とも共通Modal化済み。置換案: 「…実装では `ParamTypeMasterModal` / `BaseModelSection` の2モーダルに加え、`StageManagerModal` / `MappingMasterEditModal` / `SpeechTonePresetModal` / MappingMasterDeleteModal / WorkflowDeleteConfirmDialog / WorkflowManageModal / WorkflowNodePicker / WorkflowDiffReplaceModal も共通Modal化済み（プラン A）。」
- `docs/design/REQ-365.md:79`（AC-9 行）と `docs/design/REQ-365-test-plan.md:33`（AC-9）は ParamType/Manager/BaseModel のみ列挙。全 Settings モーダル移行と、WorkflowDiffReplaceModal は既定高さ（85dvh でない）である点を追記すると良い。
- `docs/design/REQ-365.md:61-62` は SPEC_COMMON を「85dvh 選択肢、testid、AppShell 余白」とのみ記述。T23 で追加された L1（疑似ハンドル限定）と Esc ネスト例外は未記載。
- `docs/design/REQ-365-test-plan.md:52` 768px 行や RT-5 は排他前提のため、NodePicker ネスト例外ケースの追加を推奨。

## 制限事項
- 静的検査のみ。Vitest / E2E / 実機ビューポートは未実行（コード側の AC 受入は tester-reviewer の領分）。
- CSS の実描画（`:has()` 優先順位等）は未確認で、セレクタ文字列とクラス値の読取に基づく。
- 検証対象ファイルは変更していない（本レポート以外は書込なし）。
