# システム設計書 - PBI-SYS-REQ-017: キャラクターLoRA用詳細プロンプト入力欄の追加

<system_context>
## 1. 背景と目的
現在、ComfyUIのワークフロー（例: `BunnyGarden_temari` や `ume_`）には、キャラクターLoRA用の詳細プロンプトを個別に制御するためのノードが存在しています：
- 顔用プロンプトノード: `Prompt_Char_Lora_Face` (Node Class: `PrimitiveStringMultiline` / ID: `366:344`)
- その他部位用プロンプトノード: `Prompt_Char_Lora_Other` (Node Class: `PrimitiveStringMultiline` / ID: `366:345`)

しかし、システムのマスターデータ（`mapping_master`）にこれらのノードに対応する役割（Role）が定義されていないため、画面上に入力欄を表示できず、手動マッピングも行えません。また、既存のワークフロー `ume_` では、これらのノードが誤って別の役割（`Prompt_Composition`、`Prompt_Background_Environment`）にマッピングされており、生成データが意図しないノードに送信されています。

本改修では、キャラクターLoRA用の詳細プロンプト役割を定義し、自動スキャンおよび画面での入力・生成時の送信を可能にします。また、既存のワークフローのマッピングの不整合を修正します。

## 2. 影響範囲
- **データベース**: `mapping_master` テーブルへの新規レコード追加。既存の `workflows` `workflow_mappings` データの更新。
- **バックエンド**: 起動時のデータ初期化処理（シードスクリプト）の修正。
- **フロントエンド**: Generate画面の左カラムに新規入力エリアが動的にレンダリングされ、生成時に正しいノードへデータがマッピングされて送信される。

## 3. シーケンス・データフロー
1. バックエンド起動時に `seed_initial_data` が実行され、データベースの `mapping_master` に `Prompt_Char_Lora_Face` および `Prompt_Char_Lora_Other` の役割を自動登録。
2. さらに起動時シード処理内で、既存のワークフロー `ume_` (ID: 1) の誤ったマッピングを正しい対応（`366:344` -> `Prompt_Char_Lora_Face`, `366:345` -> `Prompt_Char_Lora_Other`, `366:361` -> `Prompt_Composition`, `366:351` -> `Prompt_Background_Environment`）に修正・保存。
3. ユーザーが Generate 画面を開くと、ワークフローに紐づく `mappings` がロードされ、`input_type` が `textarea` であるため、新規追加されたキャラクターLoRA用の2つのプロンプト入力欄が `TagChipEditor` として動的に表示される。
4. 生成実行時、入力された値がそれぞれの Node ID に対し、ComfyUI API のワークフローJSONにインジェクトされて送信される。

## 4. BA-Auditによる指摘事項と設計の明確化
- **「textarea」の用語整理**:
  - マスター定義における `input_type: "textarea"` は、データベース上の分類名であり、フロントエンド（PC版）では高度な `TagChipEditor`（タグチップ形式）としてレンダリングされます。モバイル環境（`isMobile` が真の場合）に限り、通常の `<textarea>` としてフォールバックされます。この挙動は既存のプロンプト入力欄（`Prompt_Quality` 等）と同様です。
- **データ送信の変換ロジック**:
  - フロントエンドの `handleGenerate` は、`paramValues` から得た入力値を ComfyUI ワークフローJSONの対応する `node_id` に代入します。
  - 対応ノードの入力パラメータ名に `param_name` (シード値は `text`) が存在しない場合、フォールバックとして `value` が自動的に使用される実装が既にフロントエンドに存在するため、`PrimitiveStringMultiline`（ComfyUI側パラメータ名が `value`）に対してもシード値そのままで正しく動作します。
- **空入力値の挙動**:
  - プロンプト入力欄が空、またはタグチップがすべて削除された場合、空文字 `""` が ComfyUI 側に送信されます。ComfyUI および下流の CLIP Text Encode 等のカスタムノードは空文字列を正常に処理できるため、問題はありません。
- **データ同期と不整合防止**:
  - ユーザーが手動でマッピングを変更した場合、`RescanModal` の保存処理によって即座に DB が更新され、画面側も再フェッチされるため、メモリ上の状態と DB 状態は常に整合性が保たれます。
</system_context>

<frontend_pbi_spec>
## フロントエンド改修仕様（REQ-017）

### 1. 動的入力フィールドの表示
- `frontend/src/pages/GeneratePage.tsx` の既存ロジックは、`workflow.mappings` をループして `input_type === 'textarea'` のものを `TagChipEditor` または `textarea` (モバイル環境) として自動描画しています。
- 今回追加される役割 `Prompt_Char_Lora_Face` および `Prompt_Char_Lora_Other` は `input_type` が `textarea` として定義されるため、フロントエンドのコードを追加・変更することなく、自動的に `TagChipEditor` として画面に表示されます。
- 入力値の変更は `paramValues` ステートに自動保存されます（キー名は `Prompt_Char_Lora_Face` および `Prompt_Char_Lora_Other`）。

### 2. 生成実行時のパラメータ送信
- 生成ボタンクリック時（`handleGenerate` 関数内）、`paramValues` から対応するパラメータを取得し、ComfyUI ワークフローJSONの該当ノードに入力値を挿入します。
- この処理も `workflow.mappings` に基づいて動的に行われているため、フロントエンドへの個別ハードコーディングは不要です。既存の動的インジェクション処理で正しく動作することを確認します。

### 3. アセット追加（Add Asset）の対応
- 新たに表示される入力エリアの右上にある `Add Asset` ボタンから、既存のLoRAモデルやタグセットを選択してアセットチップとして追加・トグルできることを確認します。
</frontend_pbi_spec>

<backend_pbi_spec>
## バックエンド改修仕様（REQ-017）

### 1. マスタデータ初期シード定義 of the 追加（`backend/app/main.py`）
- `seed_initial_data()` 内の `masters` リストに以下の2つの役割の定義を追加します。
  - **Character LoRA Face**
    - `role`: `"Prompt_Char_Lora_Face"`
    - `expected_class_types`: `["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]`
    - `param_name`: `"text"`
    - `input_type`: `"textarea"`
    - `display_name`: `"Character LoRA Face"`
    - `title_patterns`: `["Prompt_Char_Lora_Face", "Prompt_Char_Lora_Face_Prompt", "Char_Lora_Face"]`
  - **Character LoRA Other**
    - `role`: `"Prompt_Char_Lora_Other"`
    - `expected_class_types`: `["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]`
    - `param_name`: `"text"`
    - `input_type`: `"textarea"`
    - `display_name`: `"Character LoRA Other"`
    - `title_patterns`: `["Prompt_Char_Lora_Other", "Prompt_Char_Lora_Other_Prompt", "Char_Lora_Other"]`

### 2. 既存DBに対する自動シード処理の堅牢化
- 既存の `seed_initial_data` はテーブルが完全に空の場合（`count() == 0`）にのみ動作するようになっています。
- 既存の運用DBに対しても、起動時に不足しているマスタレコードを自動登録するように処理を変更します。
  ```python
  # 各 role が存在するか個別にチェックし、存在しない場合のみ add を実行する
  ```

### 3. 既存ワークフロー `ume_` のマッピング不整合の自動修正
- `seed_initial_data()` の末尾において、既存のワークフロー `ume_` (ID: 1) が登録されている場合、マッピングレコードを正しい組み合わせに自動的に補正するクエリを追加します。
- 補正内容：
  - Node `366:344` -> `Prompt_Char_Lora_Face` のマスタIDに更新
  - Node `366:345` -> `Prompt_Char_Lora_Other` のマスタIDに更新
  - Node `366:361` -> `Prompt_Composition` のマスタIDに更新
  - Node `366:351` -> `Prompt_Background_Environment` のマスタIDに更新
- これにより、本番環境やローカル環境のコンテナ起動時に、データ更新スクリプトを別途実行することなく自動マイグレーションされます。

### 4. 自動スキャン（`workflow_scanner.py`）の検証
- データベースに追加された新規マスタデータを利用し、`POST /api/workflows/scan` にて ComfyUI ワークフローJSONを自動スキャンした際、タイトルが `Prompt_Char_Lora_Face` および `Prompt_Char_Lora_Other` のノードがそれぞれのマスタと正しく自動マッチングされることを確認します。
</backend_pbi_spec>
