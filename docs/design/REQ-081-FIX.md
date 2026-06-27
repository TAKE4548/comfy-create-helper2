# 設計書 - REQ-081-FIX: ワークフローアップロード時のスマートノードマッピング（一意判定）の漏れ修正

## 1. 目的と概要
PBI 081 で追加された「スマート初期値選択」機能において、以下の不具合および課題を修正します：
1. **競合発生時（複数候補一致時）のフォールバック不備**:
   ノードタイプ（期待クラス）とタイトルパターンが両方一致するノードが複数存在する場合（競合時）、初期選択値（`selected_node_id`）が、タイトルが一致している候補ノード（`perfect_matches`）の中からではなく、タイトルが一致しない無関係なノード（`candidates[0]`）にフォールバックして選択されてしまう問題を解消します。
   修正により、複数競合が発生しても、タイトルが一致している候補群（`perfect_matches`）の中からID順にソートされた先頭ノード（`perfect_matches[0]`）が初期値として自動選択されるようにします。
2. **期待クラスタイプ未指定（空）時のスマートマッチ無効化**:
   マスタの期待クラスタイプ（`expected_class_types`）が空（指定なし）の場合、一意判定（`perfect_matches`）時に `class_type_ok` が常に `False` と評価されてしまい、タイトルパターンのみで一意特定を行おうとするマスタでスマートマッチが無効化されるバグを修正します。

## 2. アーキテクチャ設計

### 2.1 バックエンド（FastAPI / Python）

#### 1. `workflow_scanner.py` における判定ロジックの改善
**該当ファイル**: [`backend/app/services/workflow_scanner.py`](../../backend/app/services/workflow_scanner.py)

- **期待クラスタイプチェック (`class_type_ok`) の修正**:
  `expected_class_types` が定義されていない（あるいは空リスト）の場合は、クラスタイプチェックを常にパス（`True`）とみなします。
  ```python
  class_type_ok = any(ct.strip().lower() == node_class_type.strip().lower() for ct in expected_class_types) if expected_class_types else True
  ```

- **初期値選択（フォールバック）ロジック of 修正**:
  `perfect_matches` リストのサイズに基づき、初期選択値（`selected_node_id`, `selected_class_type`, `selected_node_title`）の選択順序を以下のように最適化します。
  1. `perfect_matches` がちょうど 1 件の場合（一意のスマートマッチ）：
     - `perfect_matches[0]` を選択。`is_smart_match = True` となり警告なし。
  2. `perfect_matches` が 2 件以上の場合（複数競合が発生、かつタイトル一致するノードが複数存在）：
     - `perfect_matches[0]` (ID順ソート済みの最初のもの) を初期選択値として選択。
     - `is_smart_match = False` (複数候補であるため警告 `duplicated` は発生する)。
  3. `perfect_matches` が 0 件の場合（タイトルが一致するノードが皆無）：
     - 従来通り `candidates[0]` を初期選択値として選択。
     - `is_smart_match = False` (複数候補警告が発生)。

  **修正イメージ (Python)**:
  ```python
  is_smart_match = False
  if len(perfect_matches) == 1:
      selected_node_id, selected_class_type, selected_node_title = perfect_matches[0]
      is_smart_match = True
  elif len(perfect_matches) >= 2:
      selected_node_id, selected_class_type, selected_node_title = perfect_matches[0]
      is_smart_match = False
  else:
      selected_node_id, selected_class_type, selected_node_title = candidates[0]
      is_smart_match = False
  ```

## 3. 影響範囲
- バックエンドのワークフロースキャン処理 (`workflow_scanner.py`)
- フロントエンド側の動作への悪影響はありません（スキャン結果 API `/api/workflows/scan` のレスポンス内の `node_id` の精度向上のみであるため、既存の React 側ロジックがそのまま適用されます）。
