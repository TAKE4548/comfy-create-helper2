# REQ-346 ドキュメント検証レポート (doc-verify / AC-7)

- 検証者: doc-reviewer (doc-verify)。実装者とは別の独立レビュー。
- 検証日: 2026-10-16
- 範囲: AC-7 のみ。`docs/specs/SPEC_COMMON.md` §4-4／§4-4-1、`docs/specs/SPEC_GENERATE.md`（§2-1 追記行・版数・リンク）、承認済み設計 `docs/design/REQ-346.md`／テスト計画 §7、および実装（`frontend/src/components/common/header/*.tsx`、`headerMenuPlacement.ts`、`PageHeader.tsx`、`WorkflowActionsMenu.tsx`、`index.css`。すべて読み取りのみ）との整合。
- 本書の判定は文書の判定であり、コード AC-1〜6,8 を閉じない。

## 1. 検証対象の識別（HEAD ae170a1 上の作業ツリー）

| 対象 | git blob hash (hash-object) |
|---|---|
| `docs/specs/SPEC_COMMON.md` | 768c74b5c1100f0ac3fc10e090c0119a15bcfbb7 |
| `docs/specs/SPEC_GENERATE.md` | f88c20ee66ae5c7fec2f7c0474d7fe44ea9a0a9e |
| `docs/specs/` の `git diff` 全体 | a3cdc12e08b6b322120e6407174fb6ef4a9fcf55 |
| `docs/design/REQ-346.md`（照合基準） | 7b3412b3fc3d94912714a68fa21b183624c1a61a |
| `docs/design/REQ-346-test-plan.md`（照合基準） | b2639666167a778441d1e3a9b72c7bae52154b01 |

差分は SPEC_COMMON +31/-3 相当（版 2.5→2.6、最終更新 2026-10-16、関連リンクに REQ-346設計を追加、§4-4 に 1 行追加、§4-4-1 新設）と SPEC_GENERATE（版 2.7→2.8、最終更新 2026-10-16、関連リンク追加、§2-1 に 1 行追加）。削除された行は版数・最終更新・関連リンク行のみ。

## 2. AC-7 判定

| AC | 判定 | 証跡 | 限界 |
|---|---|---|---|
| AC-7: SPEC_COMMON の共通ヘッダー仕様に (1)ヘッダー下への重なり展開 (2)高さでの切り詰め禁止 (3)画面内の末尾到達性 (4)将来追加する展開アクションへの適用 が記載される | **PASS** | (1) §4-4-1 表「重なり展開」「配置」行: `document.body` ポータル＋`position: fixed`、ヘッダー高さ・ページ高さを押し広げない、上端＝ヘッダー下端＋6px。(2)(3)「高さの切り詰め禁止と末尾到達性」行: ヘッダー高さで切り詰めない、最大高さ＝visualViewport 高−上端−8px、超過分は `overflow-y: auto` で最後の項目へ画面内到達・押下可。(4)「将来の展開アクション」行: click 型・hover 型とも `HeaderDropdown` か同等に契約を満たし、E2E 検証一覧へ追加。いずれも実装（`HeaderDropdown.tsx` / `headerMenuPlacement.ts`）と一致（§3 参照） | 静的読解と実装との突合せのみ。実ブラウザでの挙動は別途 code-verify（T7/T8/T10）の責務で、本書では判定しない |

AC-7 の 4 要素の文言自体は充足。ただし §4 の整合性チェック C9 で SPEC_GENERATE 内の旧記述との矛盾を 1 件検出した（AC-7 の要件文言そのものには影響しないが、仕様書群全体としては是正が必要）。

## 3. 観点別チェック結果

| # | チェック | 判定 | 証跡・根拠 |
|---|---|---|---|
| C1 | 4 要素の記載（テスト計画 §7-1） | PASS | 上記 AC-7 表 |
| C2 | 数値・対象アクション・契約が実装と一致（§7-2） | PASS | 6px/8px/96px: `headerMenuPlacement.ts` の `HEADER_MENU_GAP_PX=6`/`EDGE=8`/`MIN_HEIGHT=96`。上端＝`max(anchor.bottom, headerBottom)+6`、`maxHeight=vh-top-8`、画面外 or maxHeight<96 で `shouldClose`。最大幅 `calc(100vw - 16px)`、`overflow-y-auto overscroll-contain`、`position: fixed`、`createPortal(document.body)`: `HeaderDropdown.tsx` 153–188。`--z-header-menu: 60`: `index.css`（nav 50、modal 100 の間）。`data-page-header-root`: `PageHeader.tsx` ルート div。トリガー下端＝ラッパーと直接子要素 rect の最大: `measureAnchor`。ヘッダー祖先なしで縮退: `header?.getBoundingClientRect().bottom` が undefined で無視。`ResizeObserver` は `typeof` ガード付き。ヘッダーは計測ごとに `closest` で引き直し。外側 `pointerdown`/`mousedown`、ブリッジも内側扱い。ブリッジ: `position: fixed`、`aria-hidden`、`panelWidth>0` のときのみ（640px 未満で `hidden sm:block` により非描画）、testid `resource-hover-card-bridge` 相当（`${testId}-bridge`）。対象 4 アクション（`#workflow-actions-btn`、`#header-kebab-btn`、`mobile-vram-pill` と `mobile-resource-overlay`、`resource-hover-card`＋`role=tooltip`）が各ファイルで `HeaderDropdown` 適用。A3 は `closeAtSm`（innerWidth>=640 で閉じる）を実装。hover 型は `onMouseEnter/Leave` のみでクリックトグルなし、遅延なし。検証幅は設計 §7 と一致 |
| C3 | 旧記述の残存（resource-hover-bridge／7px ブリッジ／呼出側ブリッジ／トリガー下端基準のみ）なし | PASS（SPEC_COMMON/SPEC_GENERATE §2-1 範囲） | `grep -rn "resource-hover-bridge\|7px\|呼出側.*ブリッジ\|ブリッジ.*呼出側\|top-full" docs/specs/` で該当は無関係の記述（Modal ハンドル 767px 等）のみ。「トリガー下端＋6px」は §4-4-1 配置行で「ヘッダー外／トリガーがヘッダー下端より下に出る場合のみ」と限定済み。「呼出側」は開閉状態の所有（制御型）としてのみ登場し適切 |
| C4 | 内部整合（矛盾・優先順位・適用範囲） | PASS | 配置（ヘッダー下端＋6px）、最大高さ（その上端基準）、ブリッジ高さの可変性（約20px/約80〜90px）、閉鎖閾値、click／hover の読み替え（再押下→離脱／外側押下）が相互に矛盾しない。「HeaderDropdown は制御型でトリガー種別に依存しない」と hover 型の「クリックトグルなし」も両立。A3 の 640px 境界（pill 640 未満、hover 640 以上）と整合 |
| C5 | AC-6 読み（R4）: 同一レイアウト内 resize は開いたまま追従、768px 境界を跨ぐと閉じ、開き直せば到達可 | PASS（読解） | click 型行と検証幅段落に明記。実装裏付け: `GeneratePage.tsx` 96–99 が `isMobile ? <MobileLayout/> : <DesktopLayout/>` の条件分岐で、各レイアウトが別々の `PageHeader`／`WorkflowActionsMenu` を持つため境界で再マウントされる。同一レイアウト内は resize／`ResizeObserver` リスナーで再計測。ケバブ・ピルも同一 `PageHeader` 配下のため同様に再マウントされる（設計 §9 T-17 の「推定」と一致）。「正常」と明記され、PBI の AC-6 文言との差は設計 §10-D-6 で coordinator 判断事項 |
| C6 | 設計との整合（HEO-1〜9、§8-2、非目標） | PASS | HEO-2/3/4/5/6/7/8/9 の各項が §4-4-1 の行に対応。非目標（Escape、フォーカス、ズーム、hover 遅延・クリック開閉、内容変更）一致。設計 §10-C の F-1〜F-3 は SPEC に混入していない |
| C7 | SPEC_GENERATE §2-1 追記行・版数・リンク | PASS | 追記行は `#workflow-actions-btn` を `[SPEC_COMMON §4-4-1]` に参照。内容（ベースモデル紐付け／デフォルト保存・リセット／名前変更・複製／ノード再スキャン）は `WorkflowActionsMenu.tsx` に存在（`id="workflow-actions-rescan"`、`Base Model: Auto` select 等）。diff の削除行は版・日付・関連リンク行のみで、既存の他の §2-1 行は無変更（`git diff` 確認）。版 2.8・日付・REQ-346設計リンク追加済み |
| C8 | 参照・アンカー | PASS | リンク先 `../design/REQ-346.md` は両仕様書から存在（確認済み）。`./SPEC_COMMON.md#4-4-1-共通ヘッダー展開アクション契約req-346` は見出し「4-4-1. 共通ヘッダー展開アクション契約（REQ-346）」の GitHub 方式スラッグ（小文字化・全角括弧とピリオド除去・空白→`-`）と一致（スクリプトで両者が同一文字列になることを確認）。`doc_link_validator.py`: exit 1、FAIL 37 件はすべて REQ-020/033/045/078/079/086/140/343 等の既存無関係ファイル内のリンクで、SPEC_COMMON／SPEC_GENERATE／REQ-346 関連の FAIL は 0 件（`grep -n "SPEC_COMMON\|SPEC_GENERATE\|REQ-346"` が空） |
| C9 | SPEC 群内の旧記述との矛盾 | **FAIL（軽微、F1）** | §4 の F1 参照 |
| C10 | エンコーディング（UTF-8 BOM なし、LF） | PASS | SPEC_COMMON／SPEC_GENERATE／REQ-346.md の先頭 3 バイトは BOM でなく、CR 文字数 0（`grep -c $'\r'`）。本書も UTF-8 LF |
| C11 | 本検証が対象を変更していない | PASS | 検証前後で上記 blob hash を再計算し一致（§6）。書込みは本レポートのみ |

## 4. 指摘事項

### F1（FAIL・軽微、C9）SPEC_GENERATE §3（モバイルレイアウト）に新契約と矛盾する旧記述が残存

- 場所: `docs/specs/SPEC_GENERATE.md` 258 行（`## 3. モバイルレイアウト` 本文末尾の段落）。
- 現状の文言: 「リソースホバーモニター（ResourceHoverMonitor.tsx）は幅240pxのドロップダウンカード（z-40）とし、ヘッダータイトルの隠蔽やモーダル（z-50）との衝突を防止する。」
- 矛盾の内容: SPEC_COMMON §4-4-1 は重なり順を `--z-header-menu: 60`（ボトムナビ 50 より前面、共通Modal 100 より背面）と定め、実装（`index.css`、`HeaderDropdown.tsx` の `z-[var(--z-header-menu)]`）もそうなっている。「z-40」と「モーダル z-50」は旧値で、現行の重なり順の契約（60／100）と食い違う。幅 240px はモバイル VRAM ピル展開（`w-[240px]`）には合致するが、同記述は「ResourceHoverMonitor のドロップダウンカード」全般と読め、デスクトップのホバーカードは 250px のためあいまい。
- 位置づけ: 当該行は今回の変更前から存在する（REQ-363 由来）。ただし REQ-346 が重なり順を再定義したため、同 PBI で版数を上げた SPEC_GENERATE 内に矛盾が顕在化した。設計 §3 の SPEC_GENERATE 影響分析は §2-1 のみを対象としており、この行を洗い出せていない（設計の見落とし）。
- 期待される修正（担当: doc-editor、coordinator 経由）: 当該文を、SPEC_COMMON §4-4-1 参照（ヘッダー下へ重ねて展開、重なり順 `--z-header-menu`）へ更新し、z-40／z-50 の旧値を除去する。あるいは本 PBI の範囲外と判断するなら F-1 同様の後続 PBI 候補へ追加し、本件を受容記録として残す（その判断は coordinator）。
- AC-7 への影響: AC-7 は「SPEC_COMMON に 4 要素が記載される」ことを要求し、これは充足している。本件は SPEC_COMMON の記載不備ではなく、別仕様書の旧記述との矛盾である。

### 情報（FAIL にしない）: 意図的に未是正の SPEC_GENERATE §2-1 古い行

本 PBI では是正しない（人間決定、設計 §10-C F-1）。現行実装との不一致の確認結果（`frontend/src/pages/GeneratePage` 配下の `id="..."` を抽出し、存在するのは `workflow-select`、`workflow-select-mobile`、`workflow-actions-btn`、`workflow-actions-rescan`、`popover-rescan-btn` 等のみ）は次のとおり。

| 行 | ID | 現行実装での存在 |
|---|---|---|
| ワークフロー管理 | `#workflow-manage-btn` | `GeneratePage` 配下の `id=` 抽出に無し |
| Presets ボタン | `#presets-toggle-btn` | 同上、無し |
| Bypass ボタン | `#bypass-toggle-btn` | 同上、無し |
| Param Sync ボタン | `#param-sync-btn` | 同上、無し |
| Rescan ボタン | `#rescan-btn` | 無し（近似は `#workflow-actions-rescan`／`#popover-rescan-btn`） |
| Settings ボタン | `#settings-toggle-btn` | 無し（設計 §2-3: 本番コードでの呼出なし） |

これらは後続 PBI 候補 F-1 として記録済み。加えて F1（SPEC_GENERATE §3 の旧 z-index 記述）を F-1 に併記する候補とすることを推奨する。

### 観察（指摘ではない）

- 設計 §10-D-6: PBI の AC-6 文言（「引き続き到達して押下できる」）と、仕様書／設計の読み（境界跨ぎでは「開き直せば」）に差がある。仕様書側は読みを明記済みで、PBI への受容注記の要否は coordinator 判断。
- SPEC_COMMON §4-4-1 のレイアウト境界の記述は Generate の 768px に限定して例示しており、一般化は過剰ではない。ただし実ブラウザの実測は A1 のみ（設計 §9 T-17）。ケバブ・ピルの境界跨ぎ挙動は実装上の再マウント構造から推論した。
- 仕様書中の「約20px／約80〜90px」は設計・人間提供の実測値であり、本検証では再計測していない。

## 5. 実行したコマンド（要約）

- `git diff -- docs/specs/SPEC_COMMON.md docs/specs/SPEC_GENERATE.md`（差分全体読解）
- 設計 `docs/design/REQ-346.md`（全文）、`REQ-346-test-plan.md`（全文）の読解
- 実装読解: `HeaderDropdown.tsx`、`headerMenuPlacement.ts`、`ResourceHoverMonitor.tsx`、`HeaderKebabMenu.tsx`、`PageHeader.tsx`、`WorkflowActionsMenu.tsx`、`index.css` の差分、`GeneratePage.tsx` の分岐
- `grep -rn "resource-hover-bridge|7px|呼出側.*ブリッジ|ブリッジ.*呼出側|caller|top-full" docs/specs/`、`grep -rn "z-mobile-nav|z-modal|--z-|overflow-x-auto" docs/specs/SPEC_COMMON.md`、`grep -rn "ResourceHoverMonitor|resource-hover|mobile-vram|ホバーカード..." docs/specs/*.md`（F1 を検出）
- `python <GLOBAL_HELPERS>/doc_link_validator.py`（cwd: WORKSPACE_ROOT、出力を一時ファイルへ退避し対象ファイルを grep）
- Python スクリプトでリンク先存在とアンカースラッグを照合
- 先頭 3 バイトと CR 数、`git hash-object`

## 6. ローカルモデル監査

doc-verify Skill は特定のローカル LM 監査を必須としておらず、承認済みテスト計画 §7 にも doc-verify 時の LM 監査要求は無い。したがって本検証では実施していない（モデルのロード・アンロードも行っていない）。設計フェーズの BA 監査（設計 §11）の結果は本書の判定には用いていない。QA 側で別途要求がある場合は pending として coordinator が指示する。

## 7. 限界・未実施

- 静的読解・実装との突合せ・grep／スクリプトによる機械チェックのみ。実エージェントの試行や実ブラウザ実行は無い（文書の AC-7 では要求されない）。
- コード AC-1〜6,8（typecheck、全スイート、Playwright）の判定は含まない。本書の PASS はそれらを閉じない。
- 版数（SPEC_COMMON 2.6、SPEC_GENERATE 2.8）の妥当性は前版 2.5／2.7 からの +0.1 であることのみ確認。
- レビュー対象ファイルは変更していない。検証終了時にも blob hash は上記 §1 と同一。

## 8. 総合

- AC-7: **PASS**（SPEC_COMMON §4-4／§4-4-1 に 4 要素を記載し、実装・設計と一致）。
- 整合性チェック: 10 件 PASS、1 件 FAIL（C9／F1: SPEC_GENERATE §3 の旧 z-index 記述 `z-40`／モーダル `z-50`）。
- 文書ゲートとしては F1 の是正（または coordinator による範囲外受容の記録）後に確定とすることを推奨する。F1 は 1 行の修正で、再検証は該当行と grep のみで足りる。

## 9. F1 再確認（2026-10-16、doc-reviewer / doc-verify）

doc-editor による SPEC_GENERATE 258 行（§3 モバイルレイアウト末尾段落）の書き換え後に、F1 のみを対象として読み取り専用で再検証した。レビュー対象ファイルは変更していない。

### 9-1. 判定

- **F1: 是正済み（resolved）。** C9 は FAIL から PASS に更新する。
- 新規指摘: なし。

### 9-2. 証跡

| # | 確認 | 結果 | 根拠 |
|---|---|---|---|
| 1 | 新文言と SPEC_COMMON §4-4-1／実装の一致 | PASS | 新文言: 640px 以上でホバー時に幅 250px の詳細カード（hover 型、`hoverBridge` 付き）、640px 未満で VRAM ピル（幅 96px）タップ時に幅 240px のオーバーレイ（click 型）、`HeaderDropdown` で body へ portal・fixed・ヘッダー下端＋6px、`--z-header-menu`（60）でボトムナビ（50）より前面・共通 Modal（100）より背面。実装 `ResourceHoverMonitor.tsx`: ホバーカード `w-[250px]`、`hidden sm:block`、`hoverBridge`、`role="tooltip"`、`onMouseEnter/Leave` は資源チップ群を含む監視ルートに付く。ピル `w-[96px]`、`onClick` でトグル。オーバーレイ `w-[240px]`、`sm:hidden` 配下。`HeaderDropdown.tsx`: `createPortal`、`position: fixed`、`z-[var(--z-header-menu)]`。`index.css`: `--z-mobile-nav: 50`、`--z-header-menu: 60`、`--z-modal: 100`。SPEC_COMMON §4-4-1（重なり順行、配置行、hover 型行、対象アクション表）と矛盾なし。旧値 z-40／モーダル z-50 は除去済み。「250px」と「240px」の対象（デスクトップ／モバイル）が分離され、旧版のあいまいさも解消 |
| 2 | SPEC_GENERATE の差分範囲 | PASS | `git diff -U0` のハンクは 3,5 行（版・日付）、7 行（関連リンク）、49→50 行（§2-1 追記）、257→258 行（本件）のみ。初回レビュー済みの変更に加わったのは 258 行の 1 文のみ。ActionBar 高さ 54px・44px 以上の末尾文は保持 |
| 3 | docs/specs 内の残存矛盾 | PASS | `grep -rn "z-40\|z-50\|z-\[40\]\|z-\[50\]" docs/specs/` は 0 件。`240px`／`250px` は SPEC_GENERATE 258 行のみ（SPEC_COMMON は幅数値を持たず競合しない）。`ResourceHoverMonitor`／`resource-hover`／`mobile-vram` は SPEC_COMMON 359/370/371 行と SPEC_GENERATE 258 行のみで、いずれも 640px 境界・60/100 の序列・`HeaderDropdown` 契約と整合 |
| 4 | エンコーディング | PASS | SPEC_COMMON／SPEC_GENERATE／本書とも先頭 3 バイトは BOM でない（`23 20 5x`）、CR 文字数 0（LF） |
| 5 | 他文書の不変性 | PASS | SPEC_COMMON.md 768c74b5c1100f0ac3fc10e090c0119a15bcfbb7、REQ-346.md 7b3412b3fc3d94912714a68fa21b183624c1a61a、REQ-346-test-plan.md b2639666167a778441d1e3a9b72c7bae52154b01 はすべて §1 の記録値と一致。SPEC_GENERATE.md は f88c20ee66ae5c7fec2f7c0474d7fe44ea9a0a9e から a83326555af4e196df3833c9225abaaf9280ec45 へ変化（F1 修正による想定内の差異）。`docs/specs/` の git diff 全体 hash も a3cdc12e… から c9bca148… へ変化（同上） |

### 9-3. 限界

- 静的読解・実装との突合せ・grep／hash／バイト検査のみ。実ブラウザ・実エージェント試行は無く、文書の AC-7 でも要求されない。
- コード AC-1〜6,8 の判定は含まない。本再確認の PASS はそれらを閉じない。
- 新しい SPEC_GENERATE hash（a8332655…）は本再確認時点の識別値。F1 の後続 PBI 併記（§4 の推奨）は不要になった。§2-1 の古い行は従来どおり設計 §10-C F-1（人間決定）で意図的に未是正。

### 9-4. AC-7 最終文書判定

- AC-7: **PASS**（SPEC_COMMON §4-4／§4-4-1 の 4 要素記載は不変。整合性チェック 11 件すべて PASS、F1 解消）。文書ゲートとして確定可能。
