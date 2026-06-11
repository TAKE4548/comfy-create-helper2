# 設計書 - REQ-017: キャラクターLoRA用詳細プロンプト入力欄の追加

## 1. 目的と概要
ComfyUIワークフロー内のキャラクターLoRA用詳細プロンプト（Face/Other）を個別に制御・送信するための役割（Role）を `mapping_master` に定義し、自動スキャンおよびGenerate画面上での動的入力エリア（TagChipEditor）の表示を可能にします。
また、既存のワークフロー `ume_` において、対応ノードが別の役割に誤ってマッピングされている不整合を自動的に検知・修正する仕組みを構築します。

## 2. アーキテクチャ設計

### 2.1 バックエンド（FastAPI）
- **マスタデータ初期シード定義の追加 (`backend/app/main.py`)**
  - `seed_initial_data` 内の初期マスタ定義（`masters`）に `Prompt_Char_Lora_Face`（キャラクターLoRA用顔プロンプト）および `Prompt_Char_Lora_Other`（キャラクターLoRA用その他プロンプト）を追加します。
  - すでにマスタデータがシードされている既存のデータベースに対しても、起動時に不足しているマスタレコードを自動登録する堅牢なロジックを導入します（`role` に基づく個別存在確認とインサート）。
- **既存ワークフロー `ume_` のマッピング補正 (`backend/app/main.py`)**
  - アプリ起動時の初期化処理（Lifespan内）において、ワークフロー `ume_` (ID: 1) が存在する場合、そのマッピングを以下の通り正しいマスタIDに更新します：
    - ノード `366:344` -> `Prompt_Char_Lora_Face` のマスタID
    - ノード `366:345` -> `Prompt_Char_Lora_Other` のマスタID
    - ノード `366:361` -> `Prompt_Composition` のマスタID
    - ノード `366:351` -> `Prompt_Background_Environment` のマスタID
- **自動スキャンの対応 (`backend/app/services/workflow_scanner.py` との連携)**
  - 自動スキャン時に、タイトルが `Prompt_Char_Lora_Face` または `Prompt_Char_Lora_Other` のノードを正しくマッチングできるように、それぞれのマスタレコード의 `title_patterns` にマッチングパターンを定義します。

### 2.2 フロントエンド（React）
フロントエンド（`frontend/src/pages/GeneratePage.tsx`）は `workflow.mappings` の `input_type` が `textarea` である定義をループして、動的に `TagChipEditor` をレンダリングする設計となっています。
今回追加する2つの役割も `input_type: "textarea"` としてデータベースに定義されるため、フロントエンドのソースコードを個別に変更することなく、自動的に Generate 画面左カラムに「Character LoRA Face」および「Character LoRA Other」として独立したプロンプト入力エリアが表示されます。
また、生成実行（`handleGenerate`）時のパラメータインジェクションと、アセット追加機能（`Add Asset` ボタンからのLoRAモデルやタグセットの割り当て）も、マッピング情報に基づいて動的に処理されているため、追加コードなしで動作します。

## 3. シードデータ仕様

#### 1. Prompt_Char_Lora_Face
- `role`: `"Prompt_Char_Lora_Face"`
- `expected_class_types`: `["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]`
- `param_name`: `"text"`
- `input_type`: `"textarea"`
- `display_name`: `"Character LoRA Face"`
- `title_patterns`: `["Prompt_Char_Lora_Face", "Prompt_Char_Lora_Face_Prompt", "Char_Lora_Face", "CharLoraFacePrompt", "CharLoraFace", "CharLora_Face"]`

#### 2. Prompt_Char_Lora_Other
- `role`: `"Prompt_Char_Lora_Other"`
- `expected_class_types`: `["CLIPTextEncode", "PrimitiveNode", "PrimitiveStringMultiline"]`
- `param_name`: `"text"`
- `input_type`: `"textarea"`
- `display_name`: `"Character LoRA Other"`
- `title_patterns`: `["Prompt_Char_Lora_Other", "Prompt_Char_Lora_Other_Prompt", "Char_Lora_Other", "CharLoraOtherPrompt", "CharLoraOther", "CharLora_Other"]`
