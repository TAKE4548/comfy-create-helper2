# REQ-365 文書再検証レポート r3 (doc-verify)

- 対象: SPEC_COMMON.md v2.5 / SPEC_SETTINGS.md v3.0 / PBI REQ-365.md (89行付近) / docs/design/REQ-365.md (39, 47行) の最終再作業後レビュー
- 候補: 作業ツリー未コミット差分 (SPEC_COMMON +19/-?、index.css +12/-1 を `git diff` で確認。ハッシュ未取得)。レビュー対象は読み取り専用で未変更。

## 1. 総合判定
**FAIL (軽微1件)**。N1/N2/N3 は解消し実装と一致。ただし SPEC_COMMON.md:52 (および SPEC_SETTINGS.md:114) が、MappingMasterEditModal / StageManagerModal に「indexCSSのレガシーsheet規則(下部寄せ・角丸12px・疑似ハンドル)が適用される」と記述しているが、実DOM/CSSでは両モーダルとも適用されない (新規 M1)。

## 2. N1/N2/N3 の処置
| 項目 | 判定 | 根拠 |
|---|---|---|
| N1 旧文(:50)の削除 | 解消 | 現 :53 は「モーダルは相互に排他…」のみ。「管理系モーダルを共通Modalに統一」文は消え、統一範囲は :52 に一元化。 |
| N2 env() 表記 | 解消 | :48 は `calc(100dvh - env(safe-area-inset-top))` に統一。Modal.tsx と同一。 |
| N3 ハンドル二重 | 解消 | index.css:347 は `[role='dialog']:not([data-radius-exempt])::before`。共通Modalは data-radius-exempt を持つため疑似要素なし。SPEC_COMMON §1-4 の子項目に「共通Modalのハンドルは実要素1つ」と記載。E2Eでも1つとの報告と整合。 |

## 3. 新規指摘 M1 [Medium/要修正]: レガシー2モーダルの記述が実態と不一致
### 実DOM/CSS (静的読み、両モーダル共通)
- MappingMasterEditModal.tsx:292-297 / StageManagerModal.tsx:176-181: ルートは `<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">`。`.modal-backdrop` クラスを持たず、祖先にも無い。
- index.css のシート化規則(:320-375, :163)は全て `.modal-backdrop ... > ...` の子結合子を要求する (下部寄せ :320、dialog 子の角丸12px :163/:334、疑似ハンドル :347、max-w-* 子の規則 :357-375)。よってどちらにも適用されない (T20 報告の「MappingMasterEditModal は computed content none」と整合。StageManagerModal も同一構造のため同じ結論)。
- 実際の表示: 全幅で中央配置 (`items-center justify-center`)、下部寄せなし、疑似ハンドルなし。内側パネルは `rounded-xl` (data-radius-exempt なし) のため index.css:171-179 の一律補正で角丸8px (`--ux-radius-control`)。12pxではない。モバイルでの中央モーダル(PBI不変条件3違反)が両者とも残存。
### 正しい文言
- 両モーダルとも: 「独自overlay (`fixed inset-0`, `role="dialog"`) のままで、`.modal-backdrop` を使わないため `index.css` のレガシーsheet規則(下部寄せ・疑似要素ハンドル・角丸12px)は適用されない。全幅で中央配置、角丸は内側パネルが index.css の一律補正で8px。共通Modalへの移行は段階的に行う(未移行)。」
### 修正案
- SPEC_COMMON.md:52 後半を置換:
  「MappingMasterEditModal と StageManagerModal は独自overlay（`fixed inset-0` / `role="dialog"`、`.modal-backdrop` 非使用）のままで、`index.css` のレガシーsheet規則（下部寄せ・疑似要素ハンドル・角丸12px）は適用されない。両者は全幅で中央配置のモーダルであり（内側パネルの角丸は一律補正で8px）、共通Modalへの移行は段階的に行う（未移行）。」
- SPEC_COMMON.md:38 末尾「レガシー独自backdropのモーダルは12pxのまま（§1-4参照）」は、`.modal-backdrop` を使う他のレガシー(例: `.modal-backdrop` 直下の max-w-* パネル)に対する記述としては成立するが、上記2モーダルを含むと誤読され得るため「`.modal-backdrop` を使うレガシーモーダルは12px」へ限定すること。§1-4 の子項目(上端角丸…「レガシー独自backdropは12pxのまま下部シート化」)も同様に「`.modal-backdrop` を使うレガシー」と限定。
- SPEC_SETTINGS.md:114 後半を置換:
  「MappingMasterEditModal と StageManagerModal は独自overlay（`.modal-backdrop` 非使用）のままで、共通Modalのボトムシート化もレガシーsheet規則も適用されず中央配置で表示される。共通Modalへは段階的に移行する（[SPEC_COMMON.md](./SPEC_COMMON.md) §1-4）。」

## 4. PBI / 設計書
- PBI 89行付近: 「安全領域」行は `pb-[calc(6rem+env(safe-area-inset-bottom))]` / 768px未満確保 / `md:pb-5` 解除に修正済みで `--bottom-nav-height` 依存は消え、実装(SettingsPage.tsx)・SPEC §2-4と一致。frontmatter・AC は PBI が未追跡(untracked)のため git 差分での比較不能。内容を読む限り AC-1〜AC-10 の記述は改変の形跡なし (INCONCLUSIVE 要素: 厳密な前後比較不可)。
- design/REQ-365.md :39 は「当初の現状。実装では ParamTypeMasterModal/BaseModelSection×2 は共通Modal化済み、StageManagerModal/MappingMasterEditModal はレガシー独自overlayのまま段階移行」と記述し正確 (「中央固定オーバーレイ」のままという意味でも M1 と矛盾しない)。:47 は md:pb-5 是正済みで実装と一致。
- 矛盾なし (M1 を除く)。

## 5. 横断確認
- エンコーディング: 4ファイルとも BOMなし(先頭 `# P` / `---`)、CR行数0 (LF)。
- リンク: SPEC_COMMON 関連仕様へ追加された ../design/REQ-365.md は存在。
- AC-1〜AC-10 は引き続き仕様から導出可能。AC-9(モーダル)は M1 修正後に完全PASS見込み。

## 6. 限界
静的読み(index.css, 2コンポーネント, SPEC差分)による判定。M1 のブラウザ computed-style 実測は本レビューでは未実施 (T20 の MappingMaster 計測報告と構造一致を根拠にした推論)。実描画・テスト実行は tester-reviewer の範囲。文書PASSはコードACを閉じない。

## 7. 差戻し
doc-editor へ: M1 の3箇所(SPEC_COMMON :38/:52/§1-4子項目、SPEC_SETTINGS :114)の文言修正。
