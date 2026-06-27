# TASK-REQ-081-FIX-T1: ワークフローアップロード時のスマートノードマッピング（一意判定）の漏れ修正

## 1. ターゲット識別
- **対象ファイル**: 
  - [workflow_scanner.py](../../../../../backend/app/services/workflow_scanner.py)
  - [test_workflow_scanner.py](../../../../../backend/tests/test_workflow_scanner.py)

## 2. 密閉コンテキスト (Hermetic Context)
ワークフローアップロード時の自動マッピングスキャン処理において、複数候補の競合発生時における初期値選択のフォールバック動作を修正し、また期待クラスタイプ未指定時のバグを修正します。

## 3. 実装要件 (Implementation Logic)
- [x] **複数候補競合時の初期値フォールバック修正**:
  - `workflow_scanner.py` 内で、期待クラスとタイトルが両方一致するノードが複数存在し競合している場合、無関係な `candidates[0]` を選ぶのではなく、タイトルが一致している候補の中の最初のノード `perfect_matches[0]` を初期選択値として設定する。
  - タイトル一致するノードが 0 件の場合のみ、従来の `candidates[0]` へフォールバックする。
- [x] **期待クラスタイプ未指定時のスマートマッチ対応**:
  - `expected_class_types` が定義されていない（空リスト）の場合は、クラスタイプ一致判定（`class_type_ok`）を常に `True` として扱い、タイトルのみで特定できるようにする。

## 4. 検証手順 (AC)
- [x] ユニットテスト `pytest backend/tests/test_workflow_scanner.py` を実行し、追加した競合フォールバックおよび空クラスタイプのテストケースを含むすべてのテストがパスすることを確認。
