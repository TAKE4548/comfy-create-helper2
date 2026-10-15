# REQ-365 文書検証レポート (doc-verify)

- 対象: REQ-365-T16 (docs/specs/SPEC_SETTINGS.md v2.6→v3.0) / REQ-365-T17 (docs/specs/SPEC_COMMON.md v2.4→2.5)
- レビュー担当: doc-reviewer (独立レビュー。実装者の自己確認ではない)
- 候補: 作業ツリーの未コミット差分 (`git diff -- docs/specs/SPEC_SETTINGS.md docs/specs/SPEC_COMMON.md`, SETTINGS +56/-?、COMMON +9/-4)。ハッシュは未取得 (未コミットのため)。
- 参照: docs/backlog/pbi/active/REQ-365.md (AC-1..10), docs/design/REQ-365.md, docs/design/REQ-365-test-plan.md, 実装 frontend/src (読み取り専用)
- 本レビューで仕様書・カード・実装は変更していない (書込みは本レポートのみ)。

## 1. 総合判定

文書総合: **FAIL (要修正3件・軽微数件)**。重大度の高い欠陥は SPEC_COMMON §1-3 の文章破損と、`--bottom-nav-height` の実在しない参照、共通Modal統一範囲の過大記述。いずれも修正は小規模。文書PASSはコードACを閉じない。

## 2. AC別 文書判定

| AC | 判定 | 根拠 / 限界 |
|---|---|---|
| AC-1 (xl 2カラム) | PASS | SETTINGS §3-1 「xl(>=1280px)で2カラム、左=ワークフロー(上)・BaseModel(下)、右=MappingMaster、Row-Span余白を作らない」。実装 SettingsPage.tsx:101-108 (`xl:grid-cols-2`, 右 `xl:row-span-2`, `order-1/2/3`) と一致。<1280pxの順序も一致。 |
| AC-2 (短縮ラベル/スワイプ/44px/下部余白) | PASS (指摘A参照: 下部余白の変数名のみ要修正) | §3 短縮名5種、SettingsTabBar.tsx の `shortLabel` と完全一致。`snap-x snap-mandatory`、`min-h-11`。aria-label は長い名称で丸数字なし (実装 `aria-label={tab.label}`) と一致。`pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-5` は SettingsPage.tsx:155 と一致。 |
| AC-3 (超スリムカード) | PASS (限界あり) | §3-1 に1行目/2行目/バッジ/Target Node非表示/aria-label 保持を記述。PBI文言と整合。`thead` 非表示・`.settings-mobile-table` の語は仕様側に無い (実装詳細として許容)。実装のDOM検証は本レビュー範囲外。 |
| AC-4 (カスタム型マスタ=モーダル) | PASS | §3-2。`ParamTypeMasterManagerModal.tsx` 実在、共通 Modal 使用、`sheetMaxHeightClass="max-h-[85dvh]"`。list→form 排他遷移を記述。 |
| AC-5 (統合型プロンプトエディタ) | PASS (軽微指摘E) | §3-3 は種別セレクタ(実在6キー)、左右2ペイン、群 `llm_params_audit` / `llm_params_scene_generate` 連動、draft保持を記述。実装: `PROMPT_EDITOR_KEYS`=GROUP_PROMPTS.prompt、`PROMPT_PARAM_GROUP_MAP` で audit_* 4種→audit、scene_generate* 2種→scene_generate。仕様は6キーの具体名を列挙していないため、PBI記載の日本語種別名(最適化/タグ提案…)と実キーの対応が仕様単体からは導けない。 |
| AC-6 (口調テスト実行) | PASS (限界あり) | §3-4 は既存 `POST /speech-tone-presets/rewrite`、古い応答破棄を記述。PBI「右ペインにプレビュー」の配置は仕様に明記なし。API/DB不変は §6 と矛盾なし。実装との突合は未実施。 |
| AC-7 (サービス行インラインログ) | PASS | §3 末尾に行ごと死活ランプ+「ログ ▼」直下展開、既存の折り畳み・7秒/120秒規定を維持。§5 の「3つのservice cards」旧記述は修正済み (重複矛盾なし)。 |
| AC-8 (閾値線リアルタイム連動) | PASS (軽微指摘F) | VramGuardSection.tsx: `data-testid="vram-threshold-line"` / `vram-threshold-tag` が `minFreeGb` ローカルStateにバインド。色分け実装: 空き<閾値=赤(`below`)、閾値≦空き<閾値+1.0GB=黄(`approaching`)、それ以上=緑。仕様の「赤/黄」と一致 (緑は仕様未記載だが矛盾なし)。 |
| AC-9 (ボトムシート角丸16px/ハンドル) | FAIL (指摘B, C, D) | 共通Modalは `rounded-t-2xl`、ハンドル `data-testid="modal-sheet-handle"`、実装と一致。ただし §1-3 文章破損、「Settings管理系モーダルは共通Modalに統一」は過大 (MappingMasterEditModal / StageManagerModal はレガシー独自backdrop)、角丸16pxの適用範囲(免除機構)が未記載。 |
| AC-10 (LocalStorage同期) | PASS (軽微指摘G) | §3 の表に3キー。実装: `LS_KEYS.SETTINGS_ACTIVE_TAB` 書込 (useSettingsTab.ts:30)、`VRAM_GUARD_LIMIT` write-through (VramGuardSection.tsx:60)。v2 スキーマ `{prompt,dialogue}` 不変。 |

## 3. 検出した不整合 (ファイル/行・修正案)

### A. [High/要修正] `--bottom-nav-height` は frontend/src に定義が存在しない (SPEC_COMMON.md:174 / PBI Inferred points / design)
- 証拠: `grep -rn "bottom-nav-height" frontend/src` は0件。実在するのは `--mobile-nav-height: 4rem` (index.css:32, 使用は index.css:301 のレガシー規則のみ) と、AppShell.tsx:113 の `pb-[calc(54px+env(safe-area-inset-bottom))]`、AppShell.tsx:118 の nav 高さ `h-[calc(54px+env(safe-area-inset-bottom))]`。Settings の `pb-[calc(6rem+...)]` は変数を使わず固定値。
- 結論: 仕様の「`--bottom-nav-height` を用いた下部余白」は現実装と不一致。
- 修正案 (SPEC_COMMON §2-4 該当行): 「ページコンテンツは `--bottom-nav-height` と `env(safe-area-inset-bottom)` を用いた下部余白を確保する（Settingsでは…）」を「ページコンテンツは、固定ボトムナビ(高さ54px+`env(safe-area-inset-bottom)`)に操作要素が隠れないよう下部余白を確保する（Settingsでは `pb-[calc(6rem+env(safe-area-inset-bottom))]`、768px以上で `md:pb-5` に解除）。なお現状 CSS変数 `--bottom-nav-height` は未定義で、AppShell は固定値54pxを使う」へ。または実装側で変数を導入するならその旨を仕様化 (コード側判断)。
- 関連矛盾: SPEC_COMMON §1-5-1 (66行付近) は「親(AppShell)が `pb-[54px+env(safe-area)]` を持つとき子画面の `pb-24` 等の重複を禁止」と定める一方、§2-4 追記と Settings 実装は AppShell の main padding に加えて `pb-[calc(6rem+...)]` を重ねている。PBI が要求する値のため仕様矛盾として残る。修正案: §2-4 に「Settingsは上端スクロール領域内の最終操作要素が隠れない余裕として例外的に6rem+safe-areaを採用する(§1-5-1 の重複禁止の既知の例外)」と明記するか、PBIを調整する。

### B. [High/要修正] SPEC_COMMON.md:38 の文章破損 (§1-3 角丸行)
- 現状: 「…チップ・バッジ6px（モーダル外枠は実装 `Modal.tsx` の `rounded-t-2xl` / `md:rounded-2xl` に合わせ12pxから16pxへ修正）ボタン・入力・カード8px、チップ・バッジ6px」。末尾に「ボタン・入力・カード8px、チップ・バッジ6px」が重複して残っている。
- 修正案: 「- 角丸: モーダル外枠16px（共通Modal `Modal.tsx` の `rounded-t-2xl` / `md:rounded-2xl`。従来の12pxから実装に合わせて修正）、ボタン・入力・カード8px、チップ・バッジ6px」

### C. [Medium] 角丸16pxの適用範囲と免除機構の未記載 (SPEC_COMMON §1-3:38-39, §1-4:48)
- 実装: index.css:29 `--ux-radius-modal: 12px`、index.css:163-164 `.modal-backdrop > :not([data-radius-exempt])` と 171-178 の一括 8px 補正はいずれも `:not([data-radius-exempt])`。共通Modalのダイアログに `data-radius-exempt` を付与して免除 (Modal.tsx:143)、モバイルは index.css:337-340 で `1rem 1rem 0 0` を明示。レガシー独自backdrop(MappingMasterEditModal/StageManagerModal 等)は 12px のまま (index.css:334, 372)。
- したがって §1-3 の「モーダル外枠16px」は共通Modalのみ真で、全モーダルへの一律記述は不正確。
- 修正案 (§1-4 の REQ-365 追記行末尾に追加): 「角丸16pxは共通Modalに限る。共通Modalのダイアログは `data-radius-exempt` を持ち、`index.css` の一律角丸補正(モーダル12px/`rounded-*` 8px)から除外される。レガシー独自backdropは `--ux-radius-modal`(12px)のまま下部シート化される。」
- 同じく §1-3 の「768px以上で16px」「モバイル上端16px・下端0」は Modal.tsx と一致 (整合OK)。

### D. [High/要修正] 「Settingsの管理系モーダルは共通Modal(ボトムシート)に統一する」は過大 (SPEC_COMMON.md:49)
- 実装: 共通Modal化は ParamTypeMasterManagerModal / ParamTypeMasterModal / BaseModelSection(2モーダル)。MappingMasterEditModal.tsx・StageManagerModal.tsx は `fixed inset-0`/`modal-backdrop` の独自オーバーレイで共通Modalを使わない (SpeechToneSection.tsx にも独自overlay記述あり)。モバイルではindex.css:319以降のレガシーシート規則で下部寄せされるが、角丸12px・ハンドルは疑似要素・testid無し。
- 結果: AC-9「任意のモーダル」を仕様から導く場合に「統一済み」と誤読する。かつ SETTINGS §3-1 の「モーダルはモバイルでボトムシート（ハンドル付き、上端角丸16px、最大高さ85dvh）」も85dvh/16pxは上記4モーダルのみ。
- 修正案: SPEC_COMMON 該当行を「Settingsのオンデマンド管理モーダル（カスタム型マスタ一覧/フォーム、BaseModelマスタ）は共通Modalで実装する。それ以外のレガシー独自モーダルはindex.cssのレガシーsheet規則により768px未満で下部寄せとし、共通Modalへの移行は段階的に行う」へ。SPEC_SETTINGS §3-1 該当文は「Settingsの管理系モーダル（§3-2）は…」と対象を限定する。コード側で全面統一する意図なら実装タスク(コード)として扱うべき (本レビュー外)。

### E. [Medium] `sheetMaxHeightClass` のモバイル適用制約が未記載 (SPEC_COMMON.md:48)
- 実装 (Modal.tsx:168-171): `^\s*max-h-\[([^\]\s]+)\]\s*$` に一致する「単一の `max-h-[…]` トークン」のみ `--modal-sheet-max-height` として index.css:343-345 経由でモバイルに反映。複数クラス・`max-h-[85dvh] md:...`等はモバイルで既定 `calc(100dvh - env(safe-area-inset-top))` のままになる (値内の `_` は空白に変換)。
- 修正案 (48行へ追記): 「`sheetMaxHeightClass` は単一の任意値クラス `max-h-[<値>]` のみモバイルのシート最大高さに反映される（複数クラスや他形式は既定高さのまま）。」
- 併せて「上限（例: `max-h-[85dvh]`）…§1-5 のプリセット上限75/90dvhの範囲内」は 85 が 75-90 の間という意味なら可。ただし §1-5 は「上限75または90」の2値プリセットであり「範囲内」表現は曖昧。「§1-5 のプリセット(75/90dvh)の間の値で、Settings管理系は85dvhを採用」と書くと明瞭。

### F. [Low] VRAMガード2ペインはlg以上のみ
- VramGuardSection.tsx: `grid-cols-1 lg:grid-cols-2`。SETTINGS 本文は条件なしに「左=メーター、右=スライダー」。修正案: 「(1024px以上で左右2ペイン、未満は縦積み)」を追記。

### G. [Low] clamp の適用箇所
- SETTINGS §3 表: 「2.0〜14.0にclampした数値文字列」。実装は読込時(`readStoredVramLimit`)のみclamp。数値入力欄の `onChange` は未clampで state(=LS書込値)へ入り得る (VramGuardSection.tsx 約L296-301; 書込 L60)。スライダー(2.0-14.0)経由では範囲内。修正案: 「読込時に2.0〜14.0へclampする（保存値はサーバ値が正）」とし、書込側の保証を主張しない。もしくはコード側で入力をclamp。

### H. [Low] SETTINGS §3-1 の構成
- 新規レスポンシブ記述 (xl 2カラム、モバイル、スリムカード) が §3-1 の末尾 (サービス管理・import/export 段落の後ろ、約L108-112) に連続して置かれ、同節冒頭のタブ/レイアウト記述と離れている。意味上の矛盾はない。可読性のため見出し分割を推奨。
- 追加観察 (仕様ではなくコード側/tester-reviewer向け): index.css:352-360 のレガシー疑似要素ハンドル `[role='dialog']::before` は `.modal-backdrop:has(> [role='dialog'])` に一致する共通Modalにも適用され、Modal.tsx の実ハンドル(`modal-sheet-handle`)と二重表示になる可能性がある。実機/E2Eで確認要。

## 4. 契約保存・参照・エンコーディング

| 項目 | 結果 |
|---|---|
| `details-expanded-v2` スキーマ `{prompt, dialogue}` 不変 | PASS (既存L72と新表L80が同一。一時的UIを含めない旨も一致) |
| API/DB不変主張 vs §4-§6 | PASS (差分に §4/§6 の変更なし。新API記述なし。`POST /speech-tone-presets/rewrite` は既存) |
| 既存「ログ折り畳み」「7秒/120秒」「8899番」 | PASS (維持) |
| 他仕様との整合 (COMMONがタブ/LS契約を重複記載しない) | PASS (SPEC_COMMON §2-4 は SPEC_SETTINGS へリンク委譲) |
| 内部リンク/related_paths 実在 | PASS (docs/design/REQ-365.md, REQ-365-test-plan.md, docs/backlog/pbi/active/REQ-365.md, VramGuardSection.tsx, ParamTypeMasterManagerModal.tsx すべて存在) |
| SPEC_SETTINGS §7 ツリー追記 | PASS (VramGuardSection / ServiceConnectionCard / components/ParamTypeMasterManagerModal.tsx。実ファイル存在) |
| コンパクト表示名 | PASS (実装 SettingsTabBar.tsx と完全一致) |
| BOM/CR | PASS (SPEC_SETTINGS.md 先頭 `---`, SPEC_COMMON.md 先頭 `# `、CR行数0 = UTF-8 BOMなし・LF) |
| doc_mapper (`docs/specs frontend/src/pages/SettingsPage`) | 実行成功、影響文書: docs/specs/SPEC_SETTINGS.md のみ (出力は存在確認レベル。意味PASSではない) |
| `git diff --name-only` | docs: REQ-365.md(PBI), REQ-365-test-plan.md, REQ-365.md(design), SPEC_COMMON.md, SPEC_SETTINGS.md, REQ-356-test-mapping.md; 他: backend/tests/integration/legacy/test_comfy_generation_bridge.py, implementation_plan.md, frontend/*。T16/T17カードの「frontend/backendが差分に含まれない」条件は、同一作業ツリーにコード実装があるため文字どおりには適用不可。仕様2ファイルに限れば仕様差分は所有ファイル内に収まる。REQ-356-test-mapping.md、backend テスト、implementation_plan.md は REQ-365 範囲外の変更に見える (事前から存在するgit statusの変更)。コーディネーターが混入を確認すること。 |
| T17「30行以内」 | 追加 +9/-4 行で順守 |
| §1-5 アンチパターンカタログ改変 | 差分なし (PASS) |

## 5. 実施コマンド

- `git diff -- docs/specs/SPEC_COMMON.md`, `git diff -U0 -- docs/specs/SPEC_SETTINGS.md`
- `grep -rn "bottom-nav-height" frontend/src` (0件), `grep -rn "mobile-nav-height"` (index.css:32,301)
- `grep` で `data-radius-exempt`, `sheetMaxHeightClass`, `modal-sheet-handle`, `SETTINGS_ACTIVE_TAB`, `VRAM_GUARD_LIMIT`, `PROMPT_PARAM_GROUP_MAP` を実装側で確認 (Read のみ、実行テストなし)
- `python .../helpers/doc_mapper.py docs/specs frontend/src/pages/SettingsPage`
- BOM/CR確認 (`head -c3`, `grep -c $'\r'`)

## 6. 限界・未実施

- 実装のビルド/テスト/実機・E2E は未実施 (tester-reviewer の責務)。実装一致は静読ベースで、動的挙動(レスポンシブ描画、ハンドル二重表示、44px実測)は未検証。
- 実エージェント試行が必要な指示文書ではないため試行は不要。ローカルLLM監査 (qwen/qwen3.5-9b) は doc-verify Skill が要求しておらず、実施していない (not required)。
- 設計文書 (docs/design/REQ-365.md) 側にも `--bottom-nav-height` 前提の記述があるか (PBI Inferred points に存在) — 設計/PBIの修正要否はコーディネーター判断。
- 本判定は文書のみで、コードAC (AC-1..10 の実装受入) を閉じない。

## 7. 差戻し要約 (doc-editor 向け、コーディネーター経由)

1. SPEC_COMMON.md:38 重複文の除去 (指摘B)。
2. SPEC_COMMON.md §2-4 の `--bottom-nav-height` 記述を実態(固定54px+safe-area、Settingsは6rem例外)へ (指摘A)。
3. SPEC_COMMON.md:49 と SPEC_SETTINGS §3-1 の「統一」範囲を実装(4モーダルのみ共通Modal)へ限定 (指摘D)。
4. 角丸16pxの適用範囲と `data-radius-exempt`、`sheetMaxHeightClass` の単一トークン制約を追記 (指摘C, E)。
5. 任意: SETTINGS の VRAM lg 条件、clamp の適用箇所、§3-3 に6キー列挙 (指摘F, G, AC-5)。
