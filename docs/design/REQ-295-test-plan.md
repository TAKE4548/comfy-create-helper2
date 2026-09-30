---
id: REQ-295
type: test-plan
status: complete
---

# REQ-295 テスト計画

## 基準確認

- リポジトリルートから `mypy backend` を実行し、終了コード、エラー数、checked source files数を記録する。
- 現時点の再現: 131 files、19 filesに101 errors。
- 既存テストを確認し、各カードで変更した分岐を覆うテストを選ぶ。型注釈だけの変更に実装を写しただけのテストは追加しない。

## カード別の検証

| Card | 局所検証 |
|---|---|
| T1 | migration stepsの既存単体/統合テストでInspector引数、未作成テーブル、既存テーブルの経路を確認。mypyでsteps.pyのエラーが消えることを確認。 |
| T2 | LLM request/speech/translation既存サービスとrouterテストを実行。model/params/imageが設定済み/Noneの契約、テキスト専用呼び出し、translation metadataの返却値を確認。 |
| T3 | v1移行スクリプトの既存テストまたはfixtureでnullable IDのデータ経路を確認。llm_parserの空結果と通常結果、Windows環境のloop defense既存テストを実行。 |
| T4 | bubble detectorの既存画像テストで閾値判定を確認。snapshot/comfy画像エンドポイントとTagSet/Lora検索経路の既存テストを実行。 |
| T5 | 変更したroutersの既存テストを実行。nullable日時、update payload、translate metadata、speech batch callback、StaticFiles overrideの挙動を確認。 |

## 終了条件

1. 全カード後の `mypy backend` が終了コード0、errors 0。
2. `mypy backend` が少なくとも131 source filesを引き続き対象としている。
3. バックエンド全テストがPASS。
4. 全関連テストでREQ-294由来を含む既存作業の回帰がない。失敗がベースラインの場合は再現根拠を分離して記録し、未解決は明示する。

## 2026-09-29 統合検証結果

- `mypy backend`: PASS。エラー0、131 source filesを確認。
- 全pytest: PASS、356 passed。テスト専用の一時SQLite DB・snapshot・logディレクトリを使い、モデルmetadataを作成してから実行した。一時ディレクトリは実行後に削除した。
- 初回の全pytestは既定 `../db` が読み取り専用でsnapshot書込み/DB更新に失敗した。さらにschema未初期化の一時DBでは `test_deprecation_clean` がparam_type_masters不在で失敗したため、空の一時DBにモデルschemaを初期化して再実行し、全件PASSを確認した。
- ローカルpytestはStarlette `httpx` deprecation warningを1件出すが、REQ-295の型変更とは無関係。
- `git -c safe.directory=... diff --check`: REQ-294の並行変更ファイル `backend/app/schemas/speech.py:71` にEOFの空行を検出。REQ-294の所有変更なので変更していない。LF/CRLF警告も複数の変更ファイルで表示された。
