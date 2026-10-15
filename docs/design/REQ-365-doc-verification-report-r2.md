# REQ-365 文書再検証レポート r2 (doc-verify)

- 対象: REQ-365-T16 (docs/specs/SPEC_SETTINGS.md v3.0) / REQ-365-T17 (docs/specs/SPEC_COMMON.md v2.5) の差戻し1回目後の再レビュー
- レビュー担当: doc-reviewer (独立。初回レポート `REQ-365-doc-verification-report.md` は未改変)
- 候補: 作業ツリー未コミット差分 (`git diff -- docs/specs/SPEC_COMMON.md docs/specs/SPEC_SETTINGS.md`)。`--numstat`: COMMON +10/-6、SETTINGS +49/-9。ハッシュ未取得。
- 実装 (Modal.tsx, index.css, AppShell.tsx, SettingsPage.tsx, llmSettingsGroups.ts, VramGuardSection.tsx 等) は読み取り専用で突合。仕様・カード・実装は変更していない。

## 1. 総合判定

**FAIL (軽微1件で未達)**。初回指摘 A〜H は実質すべて解消し、実装との一致も確認できた。ただし再作業で新たな内部矛盾が1件残っている (SPEC_COMMON.md:50 に旧文が残存し、同:49 と矛盾)。修正は1行削除のみ。

## 2. 指摘 A〜H の処置

| 指摘 | 判定 | 根拠 |
|---|---|---|
| A `--bottom-nav-height` / Double Padding 例外 | 解消 | SPEC_COMMON.md:175 (§2-4) は「54px+safe-area」「AppShell main は `pb-[calc(54px+env(safe-area-inset-bottom))] md:pb-0`」「CSS変数 `--bottom-nav-height` は定義しない」「Settings は `pb-[calc(6rem+…)]` / `md:pb-5`」と記述。AppShell.tsx:113,118、SettingsPage.tsx:155 と一致。`grep bottom-nav-height frontend/src` は0件。§1-5 Double Padding (同:67) に「既知の例外: Settings…§2-4参照」を追記し、§2-4 の「Double Padding 防止の既知の例外」と相互参照で整合。§1-5 の防御策の値自体は不変。「768–1023 rail / 1024以上 sidebar では適用しない」は AppShell の `md:pb-0` と、Settings の `md:pb-5` に整合。 |
| B §1-3 文章破損 | 解消 | SPEC_COMMON.md:38 は単一文に整理され重複なし。 |
| C 角丸16pxの範囲・免除機構 | 解消 | :38 と :48 に「共通Modalに限る」「`data-radius-exempt`」「レガシーは12px」を記述。Modal.tsx:143、index.css:29,163-178,334,338-340,372 と一致。:39「モバイル上端16px・下端0、768px以上で四隅16px」は `rounded-t-2xl rounded-b-none md:rounded-2xl` と一致。 |
| D モーダル統一の過大記述 | 部分解消 → 新規N1 | :49 で共通Modal4種 (ParamTypeMasterManagerModal / ParamTypeMasterModal / BaseModelSection×2) とレガシー2種 (MappingMasterEditModal / StageManagerModal) を正しく区別 (`sheetMaxHeightClass="max-h-[85dvh]"` の使用を grep で確認)。SPEC_SETTINGS §3-1-1 (:121付近) も同様に限定済み。しかし旧文が :50 に残存 (N1)。 |
| E sheetMaxHeightClass 制約・75/90 表現 | 解消 | :48 に単一トークン `max-h-[<値>]` のみ反映、`_`→空白、他形式は既定のまま、85dvh は 75/90 の中間値と明記。Modal.tsx:168-171 の正規表現、index.css:343-345 と一致。 |
| F VRAM 2ペイン lg 条件 | 解消 | SETTINGS :95付近「1024px(lg)以上で左右2ペイン、未満は縦積み」。VramGuardSection.tsx:211 `grid-cols-1 lg:grid-cols-2` と一致。色 赤/黄 (閾値+1.0GB: `VRAM_APPROACH_MARGIN_GB=1.0`、`below`/`approaching`) も一致。 |
| G clamp の適用箇所 | 解消 | LS表は「読込時 `readStoredVramLimit` で clamp」「サーバ値が正で write-through ミラー」とし、書込側の保証を主張しない。VramGuardSection.tsx:19,39 と一致。 |
| H §3-1 構成 | 解消 | 新規記述は独立見出し `### 3-1-1` / `3-2` / `3-3` / `3-4` に分離。見出し番号の重複・欠番なし。 |

## 3. 新規指摘

### N1 [Medium/要修正] SPEC_COMMON.md:50 に旧文が残存し :49 と矛盾
- 現状 (:50): 「モーダルは相互に排他とし、ネスト表示しない（list→form は一覧を閉じてからフォームを開く）。Settingsの管理系モーダル（カスタム型マスタ、BaseModelマスタ等）は共通Modal（ボトムシート）に統一する。」
- 問題: 直前の :49 は MappingMasterEditModal / StageManagerModal を「独自overlayのまま・段階移行」とし、「統一」は過大として初回で FAIL にした内容と同一。「Settingsの管理系モーダル」は文脈上これら2種を含み得る (初回指摘Dの再発)。
- 修正案: :50 の後半文「Settingsの管理系モーダル（…）は共通Modal（ボトムシート）に統一する。」を削除し、「モーダルは相互に排他とし、ネスト表示しない（list→form は一覧を閉じてからフォームを開く）。」のみとする (統一範囲は :49 に一元化)。

### N2 [Low/任意] 既定高さの表記ゆれ
- :48 の前半「既定で `calc(100dvh - safe-area-inset-top)`」と後半「`calc(100dvh - env(safe-area-inset-top))`」が同一値の別表記。Modal.tsx:19 は `env(...)` 付き。修正案: 前半を `calc(100dvh - env(safe-area-inset-top))` に統一。

### N3 [Low/観察→仕様判断] ハンドル二重表示 (仕様記述の要否)
- 実装: index.css:347-355 は `.modal-backdrop:not(.flex-col):not(:fullscreen):has(> [role='dialog']) > [role='dialog']::before` で 36×4px の疑似ハンドルを付与する。共通Modal のダイアログは `role="dialog"` で `.modal-backdrop` 直下 (Modal.tsx:129,136) のため同規則にも一致し、Modal.tsx:156 の実ハンドル `modal-sheet-handle` (w-10 h-1) と、モバイルで二重表示になる可能性が高い (静的読みのみ。実描画未確認)。
- 仕様側: :48「上端ハンドル要素は `data-testid` を持つ」と :49「レガシーは疑似要素ハンドル」は個別には正しいが、「共通Modalは疑似ハンドルを表示しない/除外される」とは書かれていない。AC-9「ハンドル」を仕様から導くと曖昧。
- 推奨: 第一に実装側で解消 (index.css の疑似要素規則に `:not([data-radius-exempt])` を追加)。その上で仕様に「疑似要素ハンドルはレガシー独自dialogのみ。共通Modalは実要素ハンドル1つだけ」を :48 末尾に1文追記。実装を変えない場合は「二重表示は既知」と明記し受入基準を調整 (コード側判断)。現状は仕様の欠落であり、本レビューでは FAIL 要因とせず観察扱い。

## 4. 横断整合・既知例外

- Settings 6rem 例外: §1-5 (:67)、§2-4 (:175) が相互参照し、値 `pb-[calc(6rem+env(safe-area-inset-bottom))]`、解除 `md:pb-5` が SETTINGS §3-1-1、PBI AC、実装 SettingsPage.tsx:155 と一致。矛盾なし。
- SETTINGS⇔COMMON: モーダル統一範囲 (SETTINGS §3-1-1 ⇔ COMMON :49) は一致。N1 を除き矛盾なし。タブ短縮名 `① モデル/② 呪文/③ セリフ/④ 翻訳/⑤ システム`、aria-label は長い名称で丸数字なしは初回確認から不変。
- 契約保存: `details-expanded-v2` `{prompt, dialogue}` 不変 (LS表と既存記述が同一、一時UIを含めない旨を明記)。API/DB: 追加なし (`POST /speech-tone-presets/rewrite` は既存)。§1-5 の値 (75/90dvh、Hit-Slop 等) 変更なし。§4/§6 差分なし。
- §3-3: 6キー (`audit_interference`, `_anima`, `audit_vocabulary`, `audit_physical`, `scene_generate`, `scene_generate_anima`) と群連動は llmSettingsGroups.ts:5-10,29-34 と完全一致 (初回AC-5 の軽微指摘も解消)。
- AC-1〜AC-10 の導出可能性: AC-1 (§3-1-1), AC-2 (§3, §3-1-1, COMMON §2-4), AC-3 (§3-1-1), AC-4 (§3-2), AC-5 (§3-3), AC-6 (§3-4), AC-7 (サービス管理段落), AC-8 (VRAM段落), AC-9 (COMMON §1-3/1-4。N3 を除き可), AC-10 (LS表)。いずれも仕様から導出可能。AC-9 は N1/N3 解消後に完全 PASS 見込み。
- 参照実在: docs/design/REQ-365.md, REQ-365-test-plan.md, docs/backlog/pbi/active/REQ-365.md, VramGuardSection.tsx, ServiceConnectionCard.tsx, ParamTypeMasterManagerModal.tsx すべて存在。
- エンコーディング: 両ファイル BOMなし (先頭 `# P` / `---`)、CR行数0 (LF)。

## 5. T17 の行数超過の評価

T17 目安は「30行以内」。差分は COMMON で +10/-6 (計16行の変更) で、文字どおりの行数では目安内。ただし :48-:49 の1行あたりの情報量が大きい (長文1行に複数規定)。初回指摘 A/C/D/E の是正に必要な記述であり、超過は正当。ただし可読性のため :48 を箇条分割 (高さ制約 / ハンドル / 角丸免除) するとよい (任意)。

## 6. 観察 (カード範囲外・編集なし)

- docs/backlog/pbi/active/REQ-365.md:89 (Inferred points) が「共通AppShellの提供する `--bottom-nav-height`」を前提に記述。実装に変数は無く、仕様は「定義しない」と明記したため PBI 文面と食い違う。コーディネーターが PBI 注記を修正するか許容するか判断。
- docs/design/REQ-365.md に `--bottom-nav-height` の出現は0件。ただし :47 は `lg:pb-5` 前提 (「lg(1024px)との境界がずれている」)、実装・仕様は `md:pb-5`。:39 は ParamTypeMasterModal 等を「独自の中央固定オーバーレイ」(実装で共通Modal化済み) と記述し、現状とズレる。設計の現状分析 (as-is) としては履歴的記述だが更新要否はコーディネーター判断。

## 7. 実施コマンド・限界

- `git diff` / `--numstat` (両仕様)、`grep` (`bottom-nav-height`, `data-radius-exempt`, `sheetMaxHeightClass`, `PROMPT_PARAM_GROUP_MAP`, `lg:grid-cols`)、`sed -n` による Modal.tsx / index.css / AppShell.tsx / SettingsPage.tsx の突合、`head -c3`・`grep -c $'\r'`、`ls` による参照確認。
- 限界: 静的読みと推論のみ。ビルド/テスト/実描画 (二重ハンドル、44px実測、xl 2カラム) は未実施 (tester-reviewer)。SETTINGS §3-3 「共通モデル(読み取り専用)」等の UI 細部は PBI 照合のみ。ローカルLLM監査は doc-verify の要求外で未実施。文書PASSはコードACを閉じない。

## 8. 差戻し要約 (doc-editor、回2/2)

1. SPEC_COMMON.md:50 の「Settingsの管理系モーダル…共通Modal（ボトムシート）に統一する。」を削除 (N1、必須)。
2. 任意: :48 の `env(...)` 表記統一 (N2)、ハンドル二重表示の扱いを1文追記または実装是正後に追記 (N3、コーディネーター判断)。
