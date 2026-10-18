---
id: REQ-378-test-plan
title: "REQ-378 検証計画（ドキュメント検証）"
status: draft
change_kind: document
related_pbi: REQ-378
design: docs/design/REQ-378.md
---

# REQ-378 検証計画: モバイルUI共通規約のSPEC_COMMON反映

## 1. 方針

- 対象は `docs/specs/SPEC_COMMON.md` の変更のみ（ドキュメント）。型検査、TDD、プロパティテスト、テストケース名のタグ付けは対象外。実エージェントの動作試行も不要（指示文の挙動を変える変更ではない）。
- 検証は **独立した検証者（doc-verify）** が行う。実装者（doc-editor）の自己確認（Task Card の V1〜V12）は参考であり、受入の代わりにならない。
- 順序: (1) 構造・機械検査 → (2) リポジトリ既定のチェック → (3) 意味・矛盾・適用範囲のレビュー → (4) 照合結果一覧の確定。1つでも失敗なら以降の PASS は出さず、理由を記録する。
- コマンドの終了コードは意味的な判定ではない。意味的な判定（3）は検証者が差分を読んで行う。
- 本計画は文書の PASS を扱う。コードのACは対象外で、文書のPASSがコードのACを閉じることはない（本PBIにコードACはない）。

## 2. ベースライン（設計時に観測した事実）

| 項目 | コマンド（cwd=操作ルート） | 観測結果（変更前） |
|---|---|---|
| UI不変条件チェック | `python -I scripts/verify_ui_invariants.py` | SUCCESS（535ファイル、違反0、exit 0）。既定の走査対象は `frontend/src` で、Markdownは走査しない |
| 共有ヘルパーのリンク検証 | `python "$HOME/.claude/skills/agent-tooling-maintenance/helpers/doc_link_validator.py"` | exit 1。既存の無関係な37件の失敗。`SPEC_` または `REQ-378` を含む行は0件 |
| 仕様書のMarkdownリンク（検査スクリプト（`docs/design/REQ-378-verify-script.md`）の links） | 検査スクリプト（`docs/design/REQ-378-verify-script.md`） | 5仕様書で49リンク。切れは1件のみ: `SPEC_GENERATE.md` L7 の `../backlog/task/active/REQ-347-T10.md`（既存欠陥。許容） |
| SPEC_COMMON のエンコーディング | 検査スクリプト（`docs/design/REQ-378-verify-script.md`） の encoding | BOMなし、LFのみ、UTF-8 |
| 使用しないチェック | `scripts/verify_test_naming.py` | 実行すると `docs/design/REQ-356-test-mapping.md` を書き換える副作用がある（設計時に1回実行し `git checkout` で復元済み）。本PBIでは使わない |

リポジトリ宣言済みの検証コマンド（`.agents/context.md`）のうち、文書に関係するのは UI不変条件チェックのみ。ドキュメント用のリンク検証コマンドは宣言されていないため、検査スクリプト（`docs/design/REQ-378-verify-script.md`）と共有ヘルパーを併用する。バックエンドの venv はワークツリーに無く（`python -I` のシステム Python 3.12 で実行可能）、フロントエンド／バックエンドのテスト一式は本PBI（文書のみ）の対象外。

## 3. AC別の検証ケース

検査スクリプト（`docs/design/REQ-378-verify-script.md`）を検証者が一時ディレクトリ（リポジトリ外）に保存し、`$S` とする。`export PYTHONIOENCODING=utf-8` を先に実行する。モード名は検査スクリプト（`docs/design/REQ-378-verify-script.md`）の先頭の使い方を参照。表中のコマンドの `\|` は Markdown 表のエスケープで、実行時は `|` を使う。`--stage 2` は T2 完了後の最終検証用（既定）、T1 完了時点だけを見るときは `--stage 1 --allow-forward 5-6`。

## 3.1 AC-1 モバイルUI共通規約の節と規則（規則ID・適用画面・適用PBI）
| 区分 | ケース | コマンド／手順 | 期待 |
|---|---|---|---|
| 正常 | §1-6 と 1-6-1〜1-6-6 の見出し、MUI-02〜MUI-11 の10行、各行6セル非空、10テーマの語、「Close／Cancel」「Edit／Save」「全文」 | `python -I $S structure` | RESULT: PASS |
| 正常（意味） | 各規則の文が提案書 COMMON-02〜11 の趣旨と一致し、適用画面とPBIが REQ-371〜377 の記述と整合する | 設計 3.4 と SPEC_COMMON §1-6-2 を並べて読む。MUI-04 が「左＝Close／Cancel、右＝Edit／Save」、MUI-08 が「行数制限時の全文確認経路」を含む | 欠落・誤記なし |
| 失敗／境界 | 規則行の欠落・順序違い・導入状況の不正値を検出できる | 設計時の確認: 状態を「未定」に変えた複製で `structure` が FAIL（実施済み） | 検査が FAIL を返す |
| 正常（差し戻し修正 L-2） | MUI-06 の適用PBIに REQ-372 が含まれる | `grep '^| MUI-06' docs/specs/SPEC_COMMON.md \| grep -c 'REQ-372'` | 1 |
| 保存 | 既存見出しの番号・名称が変わっていない | `git diff -U0 -- docs/specs/SPEC_COMMON.md \| grep '^-[^-]'` | 削除行は4行（版数・更新日・ステータス・関連仕様書）のみ |

## 3.2 AC-2 §5 のモバイル複数選択パターン
| 区分 | ケース | コマンド／手順 | 期待 |
|---|---|---|---|
| 正常 | §5-6 の存在、上部／下部／×／選択中／ボトムナビ／デスクトップ／導入前の語 | `python -I $S structure`（stage 2） | PASS |
| 正常（意味） | 上部＝「×＋選択件数＋補助選択操作」、下部＝画面固有の一括操作ドック。デスクトップ（768px以上）と既存画面（LoRAs・Tags・Settings）の適用範囲の違いが明記される | §5冒頭、§5-2、§5-6 を読む | 3点が明記 |
| 矛盾 | SPEC_HISTORY §2／§3、SPEC_GENERATE §2-11／§3 と矛盾しない（画面固有アクションを固定していない、導入前は現行が正） | 両仕様の複数選択に関する記述（`grep -n '複数選択\|MultiSelect\|長押し' docs/specs/SPEC_HISTORY.md docs/specs/SPEC_GENERATE.md`）を §5-6 と読み合わせる | 矛盾なし。SPEC_HISTORY／GENERATE に差分なし |
| 境界 | 「選択解除」は0件へ戻しモード継続、「×」は終了＋クリア。§5-1 の `exitMultiSelectMode()` の記述と衝突しない（モバイルの定義として別に書かれている） | §5-1 と §5-6 の表を読む | 解釈が一意 |
| 境界 | 全体件数の表示（§5-2）と「選択件数」の関係、ドックの用語が §1-5-1 の3 の「固定操作ドック」と区別される。用語の行が §1-5-3 の表記（「最下部固定アクションバー」）と一致する（差し戻し修正 L-3） | §5-6 の表と用語の行 | 区別が明記。`grep -c '§1-5-3でいうシート最下部' docs/specs/SPEC_COMMON.md` が 0、`grep -c '最下部固定アクションバー' docs/specs/SPEC_COMMON.md` が 2 |
| 矛盾（差し戻し修正 F-2、R-24） | 導入前の間の現行の挙動が、対象画面（特に Generate 履歴）の実際の選択UIと矛盾しない。1-6-5 の「Generateは画面内の独自の選択バーを使う」と §5 冒頭・§5-6 導入状況が両立する | `grep -c '§5-2の共通ツールバーが現行の挙動' docs/specs/SPEC_COMMON.md`（期待 0）、`grep -c '各画面の現行の選択UI（§5-1〜§5-5と各画面の仕様書）が現行の挙動である' docs/specs/SPEC_COMMON.md`（期待 2）。§5 冒頭、§5-6 導入状況、1-6-5 の `MultiSelectToolbar` 行を読み、`frontend/src` で `MultiSelectToolbar` の利用先を確認する | 0 と 2。Generate 履歴について現行の挙動を誤記する文がない |

## 3.3 AC-3 導入前／導入済みの明記
| 区分 | ケース | コマンド／手順 | 期待 |
|---|---|---|---|
| 正常 | 全規則に「導入前」または「導入済み」（現時点は全10行が導入前） | `python -I $S structure` | PASS |
| 失敗／境界 | 現状断定語が §1-6／§5-6 に無い | `python -I $S wording` | PASS（`実装済み`／`既に`／`すでに`／`現在は`／`現状は`／`現在、`なし） |
| 意味 | 導入前の規則が現行の挙動として読めない（規範形、1-6-1 の定義、§5-6 の導入状況の行、§2-4・§5冒頭の追記が「導入前の間は現行が正」としている） | 差分の全文を読み、各文が事実報告か規範かを判定する | 現状報告として読める導入前の文なし |

## 3.4 AC-4 画面固有値の非共通化
| 区分 | ケース | コマンド／手順 | 期待 |
|---|---|---|---|
| 正常 | 追加行に 42px／320px／2/2/1／3px／8px／72px／54px がない。1-6-4 が「共通トークンではない・各画面PBI」を述べる | `python -I $S numbers` | PASS |
| 境界 | 44px／54px の既存記述が変更されていない | `git diff -U0 -- docs/specs/SPEC_COMMON.md \| grep '^-[^-]'` に 44px／54px の行がない | 該当なし |
| 失敗 | 数値の混入を検出できる | 設計時の確認: 複製に `42px` を加えると `numbers` が FAIL（実施済み） | FAIL を返す |

## 3.5 AC-5 未承認事項
| 区分 | ケース | コマンド／手順 | 期待 |
|---|---|---|---|
| 正常 | 4部品（TagChipEditor／ImageCarousel／MultiSelectToolbar／TagSetFormFields）が各1行、5セル非空、状態「未承認」 | `python -I $S unapproved` | PASS |
| 意味 | 各行に判断が必要な内容と影響画面があり、現状の仕様変更として書かれていない。提案書 §3 の記述（チップ密度、中央配置、統合、Subsetsのスクロール）と一致する | 1-6-5 と提案書の影響表を読む | 一致 |
| 網羅（差し戻し修正 L-1、L-4） | `TagChipEditor` の影響画面が実際の利用先（Generate、Tag Set、LoRA、Studio の `MatrixGenerationStep`）を含む。「その他の共有部品」に根拠のない現状の断定がない | `grep -rl 'TagChipEditor' frontend/src --include=*.tsx` と 1-6-5 を突き合わせる。`grep -c 'MatrixGenerationStep' docs/specs/SPEC_COMMON.md`（期待 1）、`grep -c '現時点' docs/specs/SPEC_COMMON.md`（期待 0） | 利用先を網羅。1 と 0 |

## 3.6 AC-6 既存記述との照合
| 区分 | ケース | コマンド／手順 | 期待 |
|---|---|---|---|
| 正常 | 設計 §4 の R-01〜R-24 の各行が、変更後の SPEC_COMMON の該当箇所で判定どおり解消されている | 各行について SPEC_COMMON の該当文を `grep -n` で特定し、検証レビュー記録に「行番号、判定、結果」を書く | 全24行を記録。「食い違い」「矛盾」判定の行（R-06、R-10、R-12、R-13、R-19、R-23、R-24）は解消済み、「要確認」（R-14）は §5-6 の明記と設計 9. への記録を確認 |
| 例外の記録（差し戻し修正 F-1、R-23） | MUI-10 と既存の長押し起点の操作の関係が、例外の理由と適用範囲として記録されている。規則一覧の MUI-10 の文は変わっていない | `grep -c '^- \*\*MUI-10\*\*' docs/specs/SPEC_COMMON.md`（期待 1）。1-6-3 の MUI-10 の補足を読み、(a) 例外の対象、(b) 理由、(c) 範囲、(d) タップ代替経路の要否の決定先（REQ-375、REQ-376）の4点を確認。§5-1 の長押し、§5-6「選択の開始」、SPEC_HISTORY の `TouchSensor` 長押しと照合 | 1。4点が揃い、他仕様と矛盾しない |
| 記録（差し戻し修正 L-5） | MUI-02／05／10 の語尾が提案書より強い点が、設計 3.2.1 に記録されている（SPEC_COMMON は変えない） | 設計 3.2.1 を読み、提案書 COMMON-02／05／10 と SPEC_COMMON の該当文を突き合わせる | 差と扱いが記録され、未記録の意味の変更がない |
| 失敗／境界 | 食い違いが残っていないか、新しい矛盾が生じていないか | §1-3、§1-4、§2-4、§5 の全文と §1-6／§5-6 を通読する。特に MUI-02 と §1-5-2 の7、MUI-07 と §1-4／§4-4-1、MUI-10 と §5-1／§5-6 の長押し、MUI-11 と §5-2、導入前の間の現行の挙動の記述（§5 冒頭、§5-6）と 1-6-5 | 矛盾なし。残す例外は理由と適用範囲あり |
| 保存 | 変更が追記中心で、削除は4行のみ | AC-1 の保存ケース | 4行 |
| 記録 | 照合結果の一覧がレビュー記録に残る | 検証者が R-01〜R-24 の結果を検証レビュー記録（`docs/logs/` 等、コーディネーター指定先）へ転記 | 記録あり |

## 3.7 AC-7 リポジトリ既定のドキュメント検証
| 区分 | ケース | コマンド／手順 | 期待 |
|---|---|---|---|
| 正常 | UI不変条件チェック | `python -I scripts/verify_ui_invariants.py` | SUCCESS、exit 0、違反0 |
| 正常 | Markdownリンク・アンカーの解決（SPEC_COMMON は切れ0、他4仕様は既知の1件のみ） | `python -I $S links` | PASS（`links_checked` は 49 + 新規リンク2） |
| 正常 | 追加行の § 参照と規則ID | `python -I $S refs` | PASS（全て解決） |
| 正常 | 共有ヘルパーのリンク検証（ベースライン比較） | `python "$HOME/.claude/skills/agent-tooling-maintenance/helpers/doc_link_validator.py" 2>&1 \| grep -E 'SPEC_\|REQ-378'` | 出力なし。かつ全体の失敗件数が37件（ベースライン）から増えていない |
| 保存 | 他仕様から SPEC_COMMON への既存アンカーが有効 | `links` に含まれる（`SPEC_GENERATE.md` の `#4-4-1-...`、`#3-tagchipeditor-...`） | 解決 |
| 境界 | エンコーディング | `python -I $S encoding docs/specs/SPEC_COMMON.md docs/design/REQ-378.md docs/design/REQ-378-test-plan.md docs/backlog/task/active/REQ-378-T1.md docs/backlog/task/active/REQ-378-T2.md` | BOMなし、LF、UTF-8 |
| 境界 | シークレット・ローカルパス | `git diff -- docs/specs/SPEC_COMMON.md \| grep '^+' \| grep -iE 'users[/\]\|api[_-]?key\|token='` | 出力なし |

## 3.8 AC-8 ドキュメントのみ
| 区分 | ケース | コマンド／手順 | 期待 |
|---|---|---|---|
| 正常 | 変更が許可パスのみ | `python -I $S scope` | PASS（許可: SPEC_COMMON.md、REQ-378 の設計・検証計画・カード、PBI、`docs/design/mobile-ui-redesign/`、`docs/logs/`、`docs/backlog/ba-audit/`） |
| 境界 | 他仕様・コード・API・テストに差分なし | `git diff --name-only HEAD -- docs/specs frontend backend tests scripts docs/openapi.yaml` | `docs/specs/SPEC_COMMON.md` のみ |

## 4. 意味・矛盾・適用範囲のレビュー観点（検証者のチェックリスト）
1. 規則文は提案書の趣旨を保ち、設計者の解釈（MUI-06 の44px維持、MUI-02 の対象外）が設計 9.（Q1／Q2）の承認結果と一致するか。承認前に着手していないか。
2. MUI-01 が欠番である理由が設計に記録され、SPEC_COMMON に MUI-01 の規則がないか。
3. 「適用PBI」の記載が REQ-371〜377 の範囲と一致するか（誤った PBI に規則が割り当てられていないか）。MUI-06 に REQ-372 を加えた差し戻し修正（設計 9.3）が REQ-372 の参照（COMMON-05／06／07）と整合するか。
4. 1-6-6 と E3／E4／E5／E6 が、レガシーモーダルの分類やナビ高さを変更していないか。
5. 画面固有の仕様（Generateのタブ、LoRA／Tag Setカード、History のアクション一覧）が SPEC_COMMON に漏れていないか。
6. 共有部品の変更（TagChipEditor の密度、ImageCarousel の中央配置、MultiSelectToolbar の統合、TagSetFormFields のスクロール）が、承認済みの規則の中や既成事実として書かれていないか。
7. 設計 §4 の R-15（§5-5 の既存の食い違い）と F-2（History の既存アクション）が、SPEC_COMMON を変えずに報告されているか。
8. 差し戻し修正（設計 9.3、11.）: (a) §5 冒頭と §5-6 導入状況が各画面の現行の選択UIを現行の挙動としているか（R-24）、(b) 1-6-3 の MUI-10 の補足が例外の理由・範囲・決定先を備えるか（R-23）、(c) 設計 3.2.1 が MUI-02／05／10 の語尾の差を記録しているか。

## 5. 差し戻し後の再検証（rework）

設計 11.（Rework edits）の適用後に、独立した検証者が次を再実行する。

1. 検査スクリプトの `structure`、`unapproved`、`numbers`、`refs`、`wording`、`links`（`links_checked` は 51 のまま）、`encoding`（SPEC_COMMON、設計、検証計画、T1、T2）、`scope`。
2. `python -I scripts/verify_ui_invariants.py`、共有ヘルパーのリンク検証（37件のベースライン比較）。
3. 3.1〜3.6 の「差し戻し修正」の行のコマンドと、R-23／R-24 を含む R-01〜R-24 の再確認（検証レビュー記録を更新）。
4. 設計 11. の「適用後の確認（期待値）」の10コマンド。

## 6. 失敗時の扱い
- 構造・機械検査の失敗: 該当カード（T1／T2）の差し戻し。文言の変更が必要で承認済みの契約を変える場合は設計へ戻す。
- ベースライン既存の失敗（SPEC_GENERATE L7、doc_link_validator の37件）: 新規の失敗ではない。件数・内容が変わっていないことだけを確認し、報告に含める。
- 検証できなかった項目は PASS にせず、理由とともに保留として記録する。
