---
id: REQ-346-test-plan
title: REQ-346 共通ヘッダー展開アクション オーバーレイ契約 テスト計画
status: design-review-pending
tags: [header, dropdown, overlay, e2e, red-team, REQ-346]
related_paths:
  - docs/backlog/pbi/active/REQ-346.md
  - docs/design/REQ-346.md
  - docs/design/REQ-346-implementation_plan.md
  - docs/backlog/task/active/REQ-346-T1.md
  - docs/backlog/task/active/REQ-346-T2.md
  - docs/backlog/task/active/REQ-346-T3.md
  - docs/backlog/task/active/REQ-346-T4.md
  - docs/backlog/task/active/REQ-346-T5.md
  - docs/backlog/task/active/REQ-346-T6.md
  - docs/backlog/task/active/REQ-346-T7.md
  - docs/backlog/task/active/REQ-346-T8.md
  - docs/backlog/task/active/REQ-346-T9.md
  - docs/backlog/task/active/REQ-346-T10.md
  - docs/backlog/task/active/REQ-346-T11.md
  - docs/backlog/task/active/REQ-346-T12.md
  - docs/backlog/task/active/REQ-346-T13.md
  - docs/backlog/task/active/REQ-346-T14.md
  - docs/backlog/task/active/REQ-346-T15.md
  - docs/backlog/task/active/REQ-346-T16.md
---

# REQ-346 テスト計画

作成者: architect (dev-design) / 作成日: 2026-10-16 / 改訂: 2026-10-16（人間の設計レビュー反映: A4 hover 型を契約・検証マトリクスへ含める。T5/T6/T8/T9 拡張、T10 新設）/ change_kind: mixed。コード側は 3-Gate（typecheck → 全スイート → 実ブラウザ）で判定し、ドキュメント側（AC-7）は doc-verify で別判定する。片方の PASS で他方を閉じない。

### 改訂（2026-10-16 実ブラウザ所見 R1〜R3 の反映）
人間決定: (R1) 全展開パネルの上端を**ヘッダー下端＋6px**とする。(R2) AC-3 のスクロール検証は workflow に「あふれ」を要求せず、あふれ・末尾スクロールは高い `future` アクションで判定する。(R3) ケバブの「パネル上端がトリガー下端より約2px上」を根本原因（アンカー rect の取得元）から解消する。影響: 純関数（T11）、`HeaderDropdown`（T12）、`PageHeader` 属性（T13）、`ResourceHoverMonitor`＋Tier2 統合（T14）、SPEC_COMMON 文言（T15）の再作業カードと、T7／T8／T10 の検証内容の改訂。**Tier2 の矩形スタブは「全要素に同一矩形」ではヘッダー下端≠トリガー下端を表現できないため、ヘッダー基準を検証するケースは要素ごとに矩形を返し分ける**（環境APIスタブの範囲内）。

### 改訂（2026-10-16 T8 実測所見 R4 の反映: AC-6 の読み）
人間決定 (b): Generate の実ルートは 768px で Desktop／Mobile レイアウトが入れ替わり、`WorkflowActionsMenu` が再マウントされて開いたメニューが閉じる（T8 実測: 1280×800 → 375×360 で `[role="menu"]` 0 件）。これを仕様として受容し、「境界を跨いでも開いたまま」(a) は却下した。AC-6 の判定は次の 2 区分とする: ①**同一レイアウト内の resize**（Desktop 内、Mobile 内）は開いたまま末尾項目が押下でき、上端がヘッダー下端＋6px に追従する／②**レイアウト境界（768px）を跨ぐ resize** はメニューが閉じ（正常）、**新サイズで開き直すと**末尾項目が押下できる。T7 ハーネスはレイアウトを切り替えないため従来の判定のまま。実ルートの T8 のみ上記 2 区分に分ける（§3 判定規則、§4-2 項目 7、RT-28／29）。SPEC_COMMON への追補は T16。

## 1. 方針と Seam Map

Seam Map は設計書 `REQ-346.md` §6 を正とする（重複定義しない）。要点: 実コード統合は `PageHeader`／`HeaderDropdown`／4展開アクション（A1–A4）／実zustand、遮断はネットワークのみ、jsdom の幾何は環境APIスタブに限定、配置関数は PBT 必須、幾何・到達性・重なり順・**hover 継続（実ポインター移動）**の真偽は Tier3（実ブラウザ）で判定する。hover 型(A4)の Tier2 は DOM イベント（`mouseEnter`／`mouseOut`+`relatedTarget`／`pointerDown`）を実コンポーネントへ送る形に限り、内部状態のモックは禁止。

| Tier | 目的 | 本PBIの対応 |
|---|---|---|
| Tier 1 | 静的／契約＋高速ユニット | typecheck、`verify_ui_invariants.py`、`verify_test_naming.py`、配置純関数＋PBT（T1→再作業 T11: `headerBottom`）、`HeaderDropdown` ユニット（T2→再作業 T12: ヘッダー検出・ヒットスロップ・`ResizeObserver`・`hoverBridge`）、`PageHeader` 属性（T13） |
| Tier 2 | 統合（インメモリ、ネットワーク遮断） | 各メニュー移行テスト（T3〜T5。T5 は A3＋A4、再作業 T14）、`PageHeader` 統合契約（T6: click 型＋hover 型→再作業 T14 に統合: ヘッダー下端基準・ブリッジ） |
| Tier 3 | 実ブラウザでのみ判定可能な項目 | スクロール到達性・`elementFromPoint`・resize・重なり順（T7 ハーネス、T8 実ルート）、**A4 のホバー継続・高さ上限・resize（T10）** |

すべて CPU/RAM のみ（Zero-GPU）で実行する。

## 2. Test Placement Plan（MUST [W-DD-PLACE]）

既存ファイルを拡張する。新規ファイルは主題名のみで、チケットID（REQ/PBI+数値）をファイル名・ディレクトリに含めない。ケース名は `[REQ-346/AC-n]` を含める。

| AC | 配置先（拡張＝既存／新規＝新規モジュールに対応） | 担当 | フィルタ付き検証コマンド（`cd frontend`） |
|---|---|---|---|
| AC-1,3,5,6（数値。**`headerBottom` 追加は再作業 T11**） | 新規（作成済み）: `src/components/common/header/__tests__/headerMenuPlacement.test.ts`（新規モジュールの対応テスト） | T1→**T11** | `npx vitest run src/components/common/header/__tests__/headerMenuPlacement.test.ts -t "REQ-346/AC-1"` |
| AC-1〜6,8（プリミティブ。**ヘッダー検出・ヒットスロップ・`ResizeObserver`・`hoverBridge` は再作業 T12**） | 新規（作成済み）: `src/components/common/header/__tests__/HeaderDropdown.test.tsx`（新規コンポーネントの対応テスト） | T2→**T12** |
| AC-1（`PageHeader` ルートの目印属性。**新規 T13**） | 拡張: `src/components/common/__tests__/PageHeader.test.tsx` | **T13** | `npx vitest run src/components/common/__tests__/PageHeader.test.tsx -t "REQ-346/AC-1"` | `npx vitest run src/components/common/header/__tests__/HeaderDropdown.test.tsx -t "REQ-346/AC-6"` |
| AC-1〜4,6（A1） | 拡張: `src/pages/GeneratePage/components/__tests__/WorkflowActionsMenu.test.tsx` | T3 | `npx vitest run src/pages/GeneratePage/components/__tests__/WorkflowActionsMenu.test.tsx -t "REQ-346/AC-3"` |
| AC-1,3〜6（A2） | 拡張: `src/components/common/header/__tests__/HeaderKebabMenu.test.tsx` | T4 | `npx vitest run src/components/common/header/__tests__/HeaderKebabMenu.test.tsx -t "REQ-346/AC-1"` |
| AC-1,3,4,6（A3。ヘッダー下端基準は再作業 T14） | 拡張: `src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx`（既存 `[REQ-363/AC-6]` の実装クラス検証を契約属性検証へ更新済み） | T5→**T14** | `npx vitest run src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx -t "REQ-346/AC-6"` |
| AC-1〜6（A4 hover 型。AC-2/AC-4 は設計 §8-2 の読み替え。**ブリッジはプリミティブ描画へ、testid は `resource-hover-card-bridge`**） | 拡張: 同上 `ResourceHoverMonitor.test.tsx`（既存3ケースは無改修で PASS。ブリッジ参照の既存2ケースは更新） | T5→**T14** | `npx vitest run src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx -t "REQ-346/AC-2"` |
| AC-1〜6,8（全アクション横断・将来アクション、click 型＋hover 型。**ヘッダー下端基準・ブリッジ testid 更新は再作業 T14 に統合**） | 拡張: `src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | T6→**T14** | `npx vitest run src/components/common/__tests__/unifiedHeaderIntegration.test.tsx -t "REQ-346/AC-8"` |
| AC-1〜6,8（実ブラウザ・マトリクス。**上端＝ヘッダー下端＋6px、AC-3 のあふれ判定は future のみ、resize 後の上端追従**） | 新規（作成済み・改訂中）: `frontend/e2e/headerMenuOverlay.spec.ts`＋`frontend/e2e/fixtures/header-menu-harness.html`／`headerMenuHarness.tsx`（既存E2Eはヘッダー展開を対象としない別主題のため新規。主題名で命名） | T7（本文改訂） | `npx playwright test e2e/headerMenuOverlay.spec.ts -g "REQ-346/AC-3"` |
| AC-1〜3,5,6（実ルート。A4 は Generate Desktop の重なり順＋**Mobile 折り返しヘッダー(700×900)での隙間被覆**を追加。上端＝ヘッダー下端＋6px） | 新規: `frontend/e2e/headerMenuRoutes.spec.ts` | T8 | `npx playwright test e2e/headerMenuRoutes.spec.ts -g "REQ-346/AC-6"` |
| AC-1〜6（A4 hover 型の実ブラウザ個別マトリクス。ホバー継続・高さ上限・resize） | 新規: `frontend/e2e/headerHoverCard.spec.ts`（実ルート `/settings`。T7 のハーネスに依存しない） | T10 | `npx playwright test e2e/headerHoverCard.spec.ts -g "REQ-346/AC-2"` |
| AC-7 | ドキュメント: `docs/specs/SPEC_COMMON.md` §4-4-1／`SPEC_GENERATE.md` §2-1 | T9→**T15（SPEC_COMMON 文言改訂）** | doc-verify（§7） |

Tier3 の前提: `playwright.config.ts` に `webServer` が無いため、Vite dev（`http://localhost:5173`）を事前起動する（既存 `settingsResponsive.spec.ts` と同じ運用）。

## 3. 対象アクション別検証マトリクス（AC-1〜6 は「全箇所で個別に」）

| ID | アクション | 検証場所 | AC-1 | AC-2 | AC-3 | AC-4 | AC-5 | AC-6 |
|---|---|---|---|---|---|---|---|---|
| A1 | ワークフロー設定 | T3(Tier2) / T6 / T7 ハーネス / T8 実ルート（Generate Desktop+Mobile） | ✔ | ✔ 名前変更／複製／ノード再スキャン | ✔ 短高さで`ノード再スキャン`へ到達 | ✔ | ✔ 全幅 | ✔ resize（実ルート T8 は同一レイアウト内で維持、768px 跨ぎは閉鎖→開き直しで到達。R4） |
| A2 | ヘッダーメニュー（キャッシュ） | T4 / T6 / T7 / T8（Generate・Settings） | ✔ | ✔ キャッシュ再同期 | ✔ `設定`リンクへ到達 | ✔ | ✔ 全幅 | ✔ |
| A3 | モバイル VRAM 展開（<640px, click 型） | T5 / T6 / T7 / T8 | ✔ | ✔ 閉じるボタン | ✔ 末尾要素 | ✔ ピル再押下 | ✔ 375/639 | ✔ モバイル範囲内resize維持・640pxで閉鎖 |
| A4 | デスクトップ ホバーカード（≥640px, **hover 型**。設計 §8-2） | T5(Tier2) / T6(Tier2) / T7 項目10(重なり順) / T8 項目9(Generate Desktop 重なり順) / **T10(Tier3 個別マトリクス)** | ✔ ヘッダー下へ全体表示・押し広げ無し | ✔ **読み替え**: カード内へ移動しても閉じない（ホバー継続）。実ポインター移動で判定 | ✔ 短高さ(maxHeight≈100px)で実ホイールスクロール→最終行`GPU:`到達 | ✔ **読み替え**: 離脱／外側 pointerdown で閉じる、クリックトグル無し | ✔ 640/768/1024/1280・隠れない | ✔ ホバー中の resize で再計測、639 以下で非表示 |
| F | 将来アクション検証例（40項目, click 型） | T2 / T6 / T7 ハーネス | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

AC-8 は F（ハーネス上の高い将来アクション）で直接検証する。実ルート上に合成アクションは存在しないため、実ブラウザの AC-8 は `e2e/fixtures/` ハーネスで行う（本番ルートは変更しない）。hover 型の将来適用（HEO-9）は A4 自体を検証例とし、合成 hover フィクスチャは追加しない（設計 §8-2）。

**判定規則の改訂（R1〜R3, 2026-10-16）**:
- **AC-1（全アクション共通）**: パネル上端が `[data-page-header-root]` の bbox.bottom＋6px（±1px）、かつトリガー下端以上、パネル下端＞ヘッダー下端、ヘッダー高さ・各 `scrollHeight` を押し広げない。モバイル（375／639）ではヘッダー下端が約118（`actions` の折り返し 2 行目を含む）で、ピル・ケバブのパネルもそこまで下がる。
- **AC-2**: クリックする項目はヘッダー下端より下（ピルの閉じるボタンを含む）。
- **AC-3**: 判定は「`maxHeight` 内に収まる」と「最後の項目に到達できる」。**あふれ（`scrollHeight > clientHeight`）の assert は `future`（40項目）と A4 の高さ約100px ケースのみ**。workflow（4項目、高さ約225）・kebab・pill は収まる場合もスクロールになる場合も許容する（高さ 280 のデスクトップでは workflow の `maxHeight` が約216のため内部スクロールになり得る）。
- **AC-6**: resize 後も上端＝ヘッダー下端＋6px（ヘッダー高さの変化に追従）、末尾到達。**R4（実ルート Generate・T8）**: ①同一レイアウト内（Desktop 1280×800→1024×768、Mobile 700×900→375×667／375×360）は開いたまま、上端＝ヘッダー下端＋6px（±1px）、最後の項目が押下可（閉じたら FAIL）。②レイアウト境界（768px）を跨ぐ resize（1280×800→375×360。逆方向も）はメニューが閉じる（`[role="menu"]` 0 件が正常）。新サイズで開き直すと最後の項目が押下可（`elementFromPoint` 一致・`click({ trial: true })` 成立）。ハーネス（T7）はレイアウトを切り替えないため従来どおり（1280×800→375×360 を開いたまま）。

検証幅×高さ（設計 §7）: 375×667, 639×667, 640×800, 767×900, 768×1024, 1023×768, 1024×768, 1280×800、短い高さ 360（全幅）。Red Team: 320×667, 高さ 280。A4（hover 型）は 640×800, 768×1024, 1024×768, 1280×800 と、トリガー下端から `maxHeight`≈100px となる高さ（約180前後）、639 では「非表示」のみ確認する。

## 4. シナリオ

### 4-1. 統合フロー（Tier2）
1. `PageHeader actions=<WorkflowActionsMenu/>`（実コンポーネント）で、トリガーを押下→ポータルパネルが `body` 直下に fixed で出現→項目押下で props 呼出＋閉鎖。
2. 右クラスタのケバブ／ピル展開を同じ `PageHeader` で連続開閉し、同時に開くパネルは1つ（外側 pointerdown で前者が閉じる）。
2b. A4（hover 型）: モニタへの `mouseEnter` でポータルのカードが `body` 直下に fixed で出現（ブリッジはモニタ内）→ `mouseOut(monitor, relatedTarget: card)` で開いたまま → `mouseOut(card, relatedTarget: body)` で閉じる。外側 `pointerdown` でも閉じる。クリックでは閉じない。ケバブを開くと A4 は閉じ、パネルは1つ。
3. 将来アクション（40項目、`PageHeader actions` に配置）が `.overflow-x-auto` の外へ描画され、`maxHeight` が設定され、最終項目が panel 内に存在する。

### 4-2. E2E 受け入れ経路（Tier3）
1. ハーネス: 各アクション×各幅でパネル下端＞ヘッダー下端、押し広げなし（ヘッダー高さ・`scrollHeight` 不変）、ヘッダー下端より下の項目クリックでイベント発火、再押下で閉鎖、`elementFromPoint` が背景要素（`harness-tabs` z10 / `harness-progress` z40）でなくパネル。
2. 短い高さ 360／280: `panel.scrollTop = scrollHeight` 後に最終項目が viewport 内で `click({trial:true})` 成立。
3. resize while open: 1280×800→375×360、375×667→600×400→800×400（ピルは640pxで閉鎖）、1280×800→768×1024→375×360 の連続変更で最終項目に到達。
4. 実ルート: Generate（`localStorage['prompt-surgeon-workflow-id']=1`＋`/api/workflows` スタブ）で A1、全ルートで A2／A3。モバイル固定ボトムナビ・プリセットタブバー・進捗ラインに隠れない。ヘッダーがスクロールで画面外へ出た時にパネルが浮遊しない。Generate Desktop で A4 カードがプリセットタブバー(z10)に隠れない（T8 項目9）。
5. A4 実ブラウザ（T10、実ルート `/settings`）: 640／768／1024／1280 幅でホバー→カード上端＝ヘッダー下端＋6px・カードがヘッダー下端より下・押し広げ無し。固定ブリッジ（`resource-hover-card-bridge`）がモニタ下端〜カード上端を被覆。実ポインターをモニタ→隙間→カードへ `steps` 付きで移動してもカードが開いたまま、カード上の実ホイールで内部スクロール。短い高さ（`maxHeight`≈100px）で最終行到達。離脱・外側押下で閉鎖、クリックトグル無し。ホバー中 resize（1280×800→800×400→1024×768→639×667）で再計測、639 以下で非表示。

7. 実ルートの resize（T8、R4）: 同一レイアウト内（Desktop 1280×800→1024×768、Mobile 700×900→375×667→375×360）は開いたまま末尾項目が押下可・上端追従。レイアウト境界跨ぎ（1280×800→375×360、375×667→1280×800）はメニューが閉じ、新サイズで開き直すと末尾項目が押下可。
6. 折り返しヘッダー（T8、実ルート Generate 700×900）: トリガー〜カードの間隔が約80〜90px でも、実ポインター移動でカードが閉じない（ブリッジ被覆）。ホバー終了（トリガー幅外）で閉じる。

### 4-3. Red Team／境界／異常系
| ID | 観点 | 期待 | 検証 |
|---|---|---|---|
| RT-1 | ゼロ矩形（jsdom／未計測） | 画面外扱いにならず閉じない、`top=6` | T1 |
| RT-2 | トリガーが画面外へスクロール | `onClose` | T2, T8 |
| RT-3 | 残り高さ＜96px | 自動クローズ | T1(PBT), T2 |
| RT-4 | `visualViewport` 未定義 | `innerWidth/innerHeight` へフォールバック | T2 |
| RT-5 | StrictMode 二重マウント／アンマウント中に開いたまま | リスナー漏れ・孤立パネルなし | T2, T6 |
| RT-6 | 連続トグル10回、別メニューへ切替 | パネル最大1つ | T6, T7 |
| RT-7 | 幅 320／高さ 280（範囲外） | 左右クランプ・メニュー内スクロールで到達 | T7 |
| RT-8 | 外側 `mousedown` のみ／`pointerdown` のみ | どちらでも閉鎖（既存テスト互換） | T2, T3, T4 |
| RT-9 | 640px 境界でピルが非表示化 | 開いていたオーバーレイが閉じる（孤立しない） | T5, T7 |
| RT-10 | `localStorage` 取得不可 | ケバブが「取得不可」を表示（既存 RT-2 維持） | T4 |
| RT-11 | 親が `overflow-x-auto`（actions スロット） | パネルが切り詰められない | T6, T7 |
| RT-12 | Mobile ルートスクロールでヘッダー移動 | 追従 or 閉鎖（浮遊しない） | T8 |
| RT-13 | `align=end` でアンカーが右端（right≒viewport幅）／左端付近 | 左右 8px 余白でクランプ、はみ出さない | T1(PBT・例示), T2, T7 |
| RT-14 | 開いたまま高速に連続 resize（1280×800→768×1024→375×360 を連続） | 状態破損・ちらつき残留なし、最終項目に到達 | T7 |
| RT-15 | A4: ポインターがトリガー→隙間→カードへ移動 | カードが閉じない（ブリッジで被覆） | T5(イベント経路), T6, **T10(実ポインター)** |
| RT-16 | A4: ブリッジ外（隙間の左右）へ出る／カードの外へ出る | 閉じる（遅延なし） | T5, T10 |
| RT-17 | A4: 残り高さ＜96px（極小高さ）でホバー | 自動クローズ（HEO-7） | T10 |
| RT-18 | A4: 連続 hover 出入り10回／A4 を開いたままケバブを開く | 孤立パネルなし、パネル最大1つ | T6, T10 |
| RT-19 | A4: テレメトリ `null` | カードは位置属性込みで描画（`--%`） | T5 |
| RT-20 | A4: 639px 以下で pill 領域をホバー | カードは非表示（`display:none`）で視覚的に出ず、`[data-header-menu-bridge]` も 0 件 | T10, T7 項目10, T14(offsetWidth=0) |
| RT-21 | ヘッダー下端基準（R1）: モバイル折り返しヘッダー（約118）でのピル展開 | パネル上端＝ヘッダー下端＋6px、閉じるボタンがヘッダー下端より下 | T12, T14, T7, T8 |
| RT-22 | ケバブのヒットスロップ（R3）: ラッパー下端 36・ボタン下端 44 | ヘッダー祖先が無くても上端＝ボタン下端＋6px、水平位置はラッパー基準のまま | T12(ヘッダーなし), T14, T7(375〜767) |
| RT-23 | ヘッダー祖先なし（縮退）／ヘッダー rect ゼロ／ヘッダー下端がビューポート外 | トリガー基準へ縮退／ゼロで閉じない／`maxHeight=0` で閉じる | T11, T12 |
| RT-24 | 開いたままヘッダー高さが変わる（767↔768 折り返し、1280→375） | `ResizeObserver`／resize で上端が追従（上端＝ヘッダー下端＋6px）。`ResizeObserver` 未定義でも動作 | T12(スタブ), T7(AC-6 poll) |
| RT-25 | 低いビューポート（高さ < ヘッダー下端+110px）でパネルを開く | 自動クローズ（閾値 96px は据え置き）。範囲外高さ 280 では成立 | T11(境界 228/227), T7(280) |
| RT-26 | Mobile ルートをスクロールしてヘッダーが動く | パネルがヘッダー下端に追従、トリガーが画面外なら閉じる | T8, T12(scroll) |
| RT-27 | 折り返しヘッダー(A4)で隙間(約80〜90px)を実ポインターで横断 | カードが閉じない（固定ブリッジ）。トリガー幅外へ出ると閉じる | T8(700×900), T10(1 行ヘッダー) |
| RT-28 | Generate で 768px を跨ぐ resize（1280×800 → 375×360、逆方向 375×667 → 1280×800）を開いたまま実行（R4） | メニューは閉じる（`[role="menu"]` 0 件、孤立パネルなし）。新サイズで開き直すと末尾項目が `elementFromPoint` 一致・`click({trial:true})` 成立 | T8 |
| RT-29 | Generate で同一レイアウト内の resize（Desktop 1280×800 → 1024×768、Mobile 700×900 → 375×667／375×360）を開いたまま実行（R4） | メニューは開いたまま。上端＝ヘッダー下端＋6px（±1px）、末尾項目が押下可。閉じたら退行として FAIL（境界跨ぎとの取り違え防止） | T8 |

### 4-4. PBT（MUST、`fast-check`）
対象 `computeHeaderMenuPlacement`（T1→再作業 T11 で拡張）。不変条件: `top >= anchor.bottom + 6`、**`headerBottom` が有限なら `top >= headerBottom + 6` かつ `top` は 2 候補（`anchor.bottom + 6`／`headerBottom + 6`）の大きい方、`left` は `headerBottom` に依存しない、`maxHeight` は `headerBottom` について単調非増加**、`top + maxHeight <= viewport.height - 8`（`maxHeight >= 0`）、パネルが収まるとき `8 <= left <= viewport.width - width - 8`、`viewport.height` 縮小に対し `maxHeight` 単調非増加、`shouldClose` ⇔ (画面外 ∨ `maxHeight < 96`) を独立オラクルと比較。

## 5. 既存テストの回帰（Gate 2 で全体確認）
- `WorkflowActionsMenu.test.tsx`（`mouseDown` 外側クリック）、`HeaderKebabMenu.test.tsx`（`w-[270px]`、`pointerDown`）、`ResourceHoverMonitor.test.tsx`（A4 既存3ケース: `mouseEnter` で `w-[250px]` のカード表示、`mouseLeave` 直後に消える、`systemStats: null` のプレースホルダ。**無改修で PASS すること**）、`PageHeader.test.tsx`（`.overflow-x-auto` が存在する前提＝`PageHeader` 不変の確認）、`unifiedHeaderIntegration.test.tsx`（`mouseEnter`／`mouseLeave` による A4 カード表示・消去の既存2箇所＋プレースホルダ1箇所）、`DesktopLayout.test.tsx`、`MobileLayout.test.tsx`。
- **R1 による追加の意図的更新（T14）**: ブリッジの testid が `resource-hover-bridge`（モニタ内・固定7px）から `resource-hover-card-bridge`（`body` 直下・プリミティブ描画・可変高さ）に変わるため、参照する既存ケース（`ResourceHoverMonitor.test.tsx` の `[REQ-346/AC-1]` hover card／`[REQ-346/AC-2]` hover continuity、`unifiedHeaderIntegration.test.tsx` の `headerSnapshot` フィルタと `[REQ-346/AC-2]` A4 hover continuity）を意図保存で更新する。T3／T4 のテストは「ヘッダー祖先なし＝トリガー基準へ縮退」で無改修のまま通る（T12 の検証コマンドで回帰実行）。
- 意図的に更新する既存ケース（旧）は `ResourceHoverMonitor.test.tsx` の `[REQ-363/AC-6]` 1件のみ（A3: `top-full`／`z-40` の実装クラス検証 → 契約属性＋配置の検証。意図保存）。更新内容は検証レポートで明示する。A4 の既存ケースは開閉遅延を入れない設計（HEO-9(b)）により改修しない。

## 6. 3-Gate 受け入れコマンド（コード側）

対象サブシステムは frontend のみ（backend／API 変更なし）。順序: 静的 → 全スイート → シナリオ／Red Team。

```
# Gate 1: 静的・高速（cwd: C:\Users\audih\ws\comfy-create-helper2）
cd frontend; npm run typecheck
cd ..; backend\.venv\Scripts\python scripts/verify_ui_invariants.py
backend\.venv\Scripts\python scripts/verify_test_naming.py --strict
cd frontend; npx vitest run src/utils src/components/**/__tests__
# R1 追加: ヘッダー基準の個別テスト（各カードで実行済みの前提だが Gate 1 でも再実行）
cd frontend; npx vitest run src/components/common/header src/components/common/__tests__/PageHeader.test.tsx

# Gate 2: 全統合スイート
cd frontend; npm test

# Gate 3: 実ブラウザ（Vite dev 起動済み: cd frontend; npm run dev）
cd frontend; npx playwright test e2e/headerMenuOverlay.spec.ts e2e/headerMenuRoutes.spec.ts e2e/headerHoverCard.spec.ts
cd frontend; npx playwright test            # 既存E2E(settingsResponsive, stickyHeader)の回帰
```
`backend` のスイートは変更対象外のため、coordinator が既定の全体ゲート運用として実行する場合のみ追加する（`backend\.venv\Scripts\python -m pytest -n auto`）。typecheck が実行不能な場合に PASS を捏造しない。

## 7. ドキュメント側（AC-7）の確認観点（doc-verify）
0. （R1 改訂後の追加観点・T15）上端が「ヘッダー下端＋6px」と書かれ、旧記述（トリガー下端＋6px のみ、高さ 7px のブリッジ、呼出側のブリッジ実装、`resource-hover-bridge`）が残っていない。`data-page-header-root`・`hoverBridge`・`resource-hover-card-bridge`・ヘッダー追従（`ResizeObserver`）が実装（T11〜T14）と一致。
1. `SPEC_COMMON.md` §4-4／§4-4-1 に 4 要素（ヘッダー下への重なり展開／高さでの切り詰め禁止／画面内の末尾到達性／将来追加する展開アクションへの適用）が記載されている。
2. 記載の数値・対象アクション（A1–A4。A4 は hover 型として適用、旧「対象外」記述が残っていないこと）・hover 型の開閉規律（遅延なし・クリックトグルなし・ブリッジ）・検証幅が実装（T1〜T8）と一致し、§1-4／§2-2〜2-4 のブレークポイント記述と矛盾しない。
3. `SPEC_GENERATE.md` §2-1 の追記が SPEC_COMMON と整合し、既存の他行（古い `#workflow-manage-btn`, `#presets-toggle-btn`, `#bypass-toggle-btn`, `#param-sync-btn`, `#rescan-btn`, `#settings-toggle-btn` 行を含む）を変更していない（`git diff` で追加行のみであること）。
4. 追加リンク（REQ-346設計、§4-4-1）が解決し、版数・最終更新が更新されている。
5. ドキュメント PASS はコード AC（AC-1〜6,8）を閉じない。
6. （R4・T16）§4-4-1 に「ページがレイアウトを切り替える幅（Generate は 768px）を跨ぐ resize ではページ側の再マウントによりメニューが閉じるのは正常。新しいサイズで開き直せば末尾項目に到達・押下できる。同一レイアウト内の resize では開いたまま追従する」が記載され、既存の「ヘッダー自身の高さ変化にも追従する」等の記述・AC-7 の 4 要素・他行と矛盾しない。

## 8. AC × 証跡マトリクス（検証時に埋める。計画時点の期待）

| AC | Tier1/2 証跡 | Tier3 証跡 | doc | 判定 |
|---|---|---|---|---|
| AC-1 | T11(PBT headerBottom),T12,T13,T14(A3+A4+統合),T3,T4 | T7(全幅×全アクション: 上端＝ヘッダー下端＋6px), T8, **T10(A4)** | — | 未実施（再作業後に再判定） |
| AC-2 | T12,T14,T3,T4 | T7, T8, **T10(A4: ホバー継続に読み替え。固定ブリッジの被覆)** | — | 未実施 |
| AC-3 | T11,T12,T14,T3,T4 | T7(高さ360/280。**あふれ判定は future のみ**), T8(375×360), **T10(A4: maxHeight≈100pxで実ホイールスクロール)** | — | 未実施 |
| AC-4 | T12,T14,T3,T4 | T7, T8, **T10(A4: 離脱／外側押下に読み替え)** | — | 未実施 |
| AC-5 | T11,T12,T14,T3,T4 | T7(全幅・elementFromPoint), T8(A4 は Generate Desktop), **T10(A4)** | — | 未実施 |
| AC-6 | T11(PBT),T12(scroll/ResizeObserver),T14 | T7(resize while open: 上端追従), T8(Mobile スクロール追従。**R4**: 同一レイアウト内 resize 維持＋768px 境界跨ぎは閉鎖→開き直しで到達), **T10(A4: ホバー中 resize)** | — | 未実施 |
| AC-7 | — | — | T9 doc-verify → **T15 doc-verify（再作業後に再判定）** | 未実施 |
| AC-8 | T12,T14 | T7(ハーネス: 40項目 future action) | — | 未実施 |

## 9. 既知の制約
- jsdom では実スクロール・実レイアウトを再現できないため、到達性の最終判定は Tier3 に限る。
- iOS Safari の動的ツールバー、ブラウザズーム、キーボード操作（Escape／フォーカス）は本PBIの検証範囲外（設計 §4 非目標、§10）。タッチ端末(≥640px)での hover 型カードの emulated hover 挙動も範囲外（実機検証なし）。
- A4 の AC-2／AC-4 は PBI 文言（押下ボタン・項目）が適用できないため設計 §8-2 の読み替えで検証する。読み替えの妥当性は人間レビューの確認事項（設計 §10-B-1）。
- Tier3 は Chromium のみ（`playwright.config.ts` の project）。他ブラウザは未検証。
- R1 の実ブラウザ検証（T7／T8／T10）は T11〜T14 の完了後に行う。T12 完了時点で `ResourceHoverMonitor` の旧モニタ内ブリッジが直接子要素として残ると、実ブラウザではトリガー下端が約7px押し上がって計測されるため（T14 で削除）、中間状態の Tier3 結果は判定に使わない。
- （R4）Generate 実ルートでは 768px のレイアウト境界を跨ぐ resize でメニューが閉じる。これは仕様として受容済み（人間決定 (b)）であり、T8 は境界跨ぎで「閉じる→開き直して到達」を判定する。ケバブ・ピルの境界跨ぎ挙動は実測が A1 のみのため、T8 では A1 で判定する。
- 低いビューポート（高さ < ヘッダー下端+110px）でのパネル自動クローズ（閾値 96px 据え置き）はサポート範囲外の挙動として許容する（設計 §10-D-1）。
