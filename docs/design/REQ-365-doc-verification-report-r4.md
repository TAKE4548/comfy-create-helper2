# REQ-365 文書再検証レポート r4 (doc-verify)

- 対象: docs/specs/SPEC_COMMON.md / docs/specs/SPEC_SETTINGS.md / docs/backlog/pbi/active/REQ-365.md / docs/design/REQ-365.md
- 候補: 作業ツリー未コミット差分 (ハッシュ未取得。PBIは未追跡)。レビュー対象は読み取り専用で未変更。

## 1. 総合判定
**PASS** (r3 M1 は解消。Low の助言1件 L1 のみ。修正は任意で合否に影響しない)

## 2. M1 の検証
### index.css 側 (自分で確認)
- MappingMasterEditModal.tsx:293 / StageManagerModal.tsx:177 のルートは `className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true"`。`.modal-backdrop` なし。両ファイルとも `modal-backdrop` 文字列は 0 件。
- index.css のレガシーsheet規則は全て `.modal-backdrop` 起点: :163 (`.modal-backdrop > :not(...)` 角丸12px)、:320-:375 (下部寄せ・角丸・`::before` ハンドル :347・max-w-* 規則)、:420-:433。`.modal-backdrop` を含まない `[role='dialog']` セレクタは 0 件 (grep で確認)。よって両モーダルはレガシーsheet規則の対象外。
- 内側パネルは `rounded-xl` で `data-radius-exempt` なし → :171-179 の一律補正で 8px (`--ux-radius-control`)。文書の「内側パネルの角丸は一律補正で8px」と一致。
- 表示は全幅・中央配置 (`items-center justify-center`, パネルは `w-full max-w-3xl`)。
### 文書側
| 箇所 | 判定 | 内容 |
|---|---|---|
| SPEC_COMMON.md:38 | 解消 | 「`.modal-backdrop` を使うレガシーモーダルは12pxのまま」に限定済み |
| SPEC_COMMON.md:51 | 解消 | 同様に `.modal-backdrop` を使うレガシーに限定 |
| SPEC_COMMON.md:52 | 解消 | 2モーダルは独自overlay・`.modal-backdrop` 非使用・レガシーsheet規則非適用・全幅中央配置・角丸8px・段階移行(未移行)。実装と一致 |
| SPEC_COMMON.md:53 | 適合 | 排他モーダルのみ。旧「統一」文なし |
| SPEC_SETTINGS.md:114 | 解消 | 2モーダルは `.modal-backdrop` 非使用で中央配置、共通Modalへ段階移行、SPEC_COMMON §1-4 へリンク。:52 と矛盾なし |

## 3. 残指摘
### L1 [Low/任意] SPEC_COMMON.md:50 の「レガシー独自dialogにのみ適用」が曖昧
`index.css` の疑似要素ハンドル (:347) は `.modal-backdrop` 直下の `[role='dialog']` に限り適用される。現行の「レガシー独自dialogにのみ適用」は、:52 の独自overlay 2モーダル (非適用) を含むと誤読され得る。
推奨置換: 「`index.css` の疑似要素ハンドル（`.modal-backdrop` 直下の `[role='dialog']::before`）は `.modal-backdrop` を使うレガシーdialogにのみ適用し、…」(以降は現行のまま)。
なお、現行文言でも :52 が非適用を明示しており、直接の矛盾とまではいえないため合否には影響しない。

## 4. 全体文書チェック
- 矛盾: SPEC_COMMON §1-3/§1-4、SPEC_SETTINGS §3-1-1/§3-2、PBI、設計書 (:39 「当初の現状。…StageManager/MappingMasterEdit はレガシー独自overlayのまま段階移行」、:47 md:pb-5) は相互に一致。
- 参照/パス: 設計書 SSoT表の SPEC_SETTINGS/SPEC_COMMON、SPEC_SETTINGS→SPEC_COMMON §1-4 リンク、../design/REQ-365.md は存在。
- エンコーディング (Python バイト検査): 4ファイルとも BOMなし、CRLF 0、孤立CR 0、LF のみ (SPEC_COMMON 440行、SPEC_SETTINGS 292行、PBI 91行、設計書 212行)。`git ls-files --eol` で SPEC 2ファイルは i/lf w/lf。
- 不変契約: PBI Inferred points に `prompt-surgeon-settings-details-expanded-v2` スキーマ `{prompt, dialogue}` 維持、API/DB契約不変、モーダル排他、CSS orderのみの並べ替えが保持。SPEC_SETTINGS:114/§3-2 も API・DB契約不変・同キー非包含を維持。
- T17 スコープ: 設計書 T17 は SPEC_COMMON のみ (共通Modalシート契約、85dvh、testid、nav境界)。SPEC_COMMON の差分は §1-3 角丸、§1-4 モーダル契約に収まり、T16(SPEC_SETTINGS) と分担も重複なし。逸脱なし。

## 5. AC導出可能性
| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | PASS | SPEC_SETTINGS §3-1-1 の xl 2カラム/左右配置/<1280 縦順序 |
| AC-2 | PASS | モバイルタブバー横スワイプ・44px (§3-1-1)。短縮ラベルは §3 5タブ表 (設計書T16範囲、今回差分の対象外) |
| AC-3 | PASS | 超スリムカード/aria-label 仕様 (§3-1-1) |
| AC-4 | PASS | §3-2 オンデマンドモーダル、list→form 排他 |
| AC-5〜AC-8 | PASS (仕様記述として) | 設計書トレーサビリティ表 T8-T12 と対応。今回変更箇所外で変更なし |
| AC-9 | PASS (文書として) / 注意 | カスタム型マスタ等は共通Modalでボトムシート (ハンドル・上端16px・85dvh) と仕様化。MappingMasterEditModal/StageManagerModal はモバイルで中央表示のまま未移行と明記されており、PBI AC-9 「任意のモーダル」との差分が文書上で正直に開示されている。コード側は未達の可能性があり、tester-reviewer/コーディネーターが AC-9 範囲 (上記2モーダルを含むか) を判断すること |
| AC-10 | PASS | LocalStorage キー仕様は SPEC_SETTINGS 側で維持 |

## 6. 限界
- 静的読み (index.css, 2コンポーネント, 4文書) による判定。ブラウザの computed-style 実測・実描画・テスト実行は未実施 (tester-reviewer の範囲)。r3 の T20 報告との構造的一致が根拠。
- PBI は未追跡のため AC 文言の厳密な前後比較は不可。内容の読解のみ。
- 文書PASSはコードACを閉じない。特に AC-9 の2レガシーモーダル未移行はコード判断が必要。

## 7. 差戻し
必須の差戻しなし。任意: L1 を doc-editor が反映可。
