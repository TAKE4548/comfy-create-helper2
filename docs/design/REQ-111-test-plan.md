# REQ-111: LoRA・タグセット管理のベースモデル使い分け機能 検証計画書 (Test Plan) - 修正版

## 1. 概要
本テスト計画書は、LoRA・タグセット管理のベースモデル分類および自動抽出機能の検証手順を規定します。AI エージェントによる自動化テストにおいても、厳密な入力データと判定基準に基づき実行されます。

## 2. 自動テスト (Backend Unit Tests)
FastAPI バックエンドに対して、pytest を用いた以下のユニットテストを実装・実行します。

### 2.1. テスト項目
1. **BaseModel CRUD API の検証**:
   - `POST /api/base-models` で ID=1, Name="Anima" を登録し、`GET /api/base-models/1` で Name が "Anima" であることを確認する。
2. **CheckpointMapping CRUD API の検証**:
   - ファイル名 "anime_style_v3.safetensors" と BaseModelID=1 のマッピングを登録し、取得時に一致するかを確認する。
3. **アセット（LoRA/タグセット）への複数紐づけとフィルタ検証**:
   - `POST /api/loras` で `target_base_model_ids=[1, 2]` を渡して ID=100 の LoRA を登録する。
   - `GET /api/loras?base_model_ids=1` を実行し、ID=100 がリストに含まれることを確認する（OR 条件の正しさ）。
4. **チェックポイント自動検出ロジックの検証**:
   - ワークフロー JSON にファイル名 "anime_style_v3.safetensors" を含め、マッピング (ID=1) と一致するかを検証。
   - マッピングなしで "unknown_model_xyz.safetensors" を含む場合、抽出結果が null またはエラーフラグが true であることを確認する。

### 2.2. 実行コマンド
```bash
cd backend
.venv\Scripts\activate
pytest tests/test_base_models.py -v --tb=short
```

---

## 3. 手動検証 (Manual Verification / Integration Tests)

以下の手順を厳密に実施し、各ステップの「期待される結果」を満たすまで完了とみなします。

### 3.1. 設定画面での検証
**入力データ**: ベースモデル名 "Anima", チェックポイントファイル名 "anime_style_v3.safetensors"
1. 設定画面に「ベースモデル設定」タブが表示されていることを確認する。
2. 新しいベースモデルとして **Name: "Anima"** を作成・保存する。
   - *判定基準*: 保存完了後、一覧リストに "Anima" が表示され、DB に ID が割り当てられること。
3. マッピング設定エリアで、ファイル名 **"anime_style_v3.safetensors"** を選択し、先ほど作成したベースモデル ("Anima") とマッピングして保存する。
   - *判定基準*: 保存後、マッピング一覧に [anime_style_v3.safetensors] <-> [Anima] のペアが表示され、再読み込み時にこの関係が保持されること。

### 3.2. カード管理画面での検証
**入力データ**: LoRA 名 "Test_Lora_A", タグセット名 "Test_Set_B"
1. **LoRA 登録**: 
   - モーダルを開き、ベースモデルを **"Illus"** と **"Noob"** の両方を選択して、LoRA 名 "Test_Lora_A" で保存する。
2. **フィルタ検証 (OR 条件)**:
   - 一覧画面のフィルタ UI で `Illus` にのみチェックを入れる → *判定*: "Test_Lora_A" が表示されること。
   - フィルタを `Noob` にのみチェック入れる → *判定*: "Test_Lora_A" が表示されること。
3. **除外検証 (AND 条件の逆)**:
   - フィルタを `Anima` (マッピングされたモデル) にチェックを入れる → *判定*: "Test_Lora_A" は**表示されない**こと（ベースモデルが一致しないため）。

### 3.3. ワークフローインポートおよび生成画面での検証
**入力データ**: 
- 正常系: `workflow_valid.json` (マッピング済みファイルを含む)
- 異常系: `workflow_unknown.json` (マッピングなしの "unknown_model_xyz.safetensors" を含む)

1. **自動検知 (正常系)**:
   - `workflow_valid.json` を読み込み、コンソールまたは UI のステータスバーに「ベースモデルが自動検出されました」と表示されることを確認する。
2. **フォールバック処理 (異常系)**:
   - `workflow_unknown.json` を読み込む。
   - *判定基準*: 
     a) 部分一致で検知される場合、検知されたモデル名を UI に表示すること。
     b) 完全一致・部分一致ともにない場合、**「ベースモデルが見つかりません (unknown_model_xyz.safetensors)」というテキストのトースト通知**が表示されることが必須条件である。
3. **生成画面フィルタ初期値**:
   - 「Add Asset」ボタンを押下し、アセット選択画面が開く。
   - *判定基準*: 現在適用中のワークフローのベースモデルに基づき、関連するアセットのみが初期状態でリストアップされていること（全件表示ではない）。

## 4. 受入基準 (Acceptance Criteria)
- 上記 3.1〜3.3 のすべての「判定基準」を満たすこと。
- 自動テストの pytest 実行時に、すべてのテストケースが Green (PASS) になること。
