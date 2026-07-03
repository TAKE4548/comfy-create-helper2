# PBI-REQ-103 実行可能テスト計画: Scene Generator 機能

## 0. テスト対象 AC 一覧

| AC | 内容 | 種別 |
|---|---|---|
| AC-1 | 🎬 Scene ボタン表示 + モーダル起動 | ブラウザ手動 |
| AC-2 | textareaフィールドのチェックボックス選択 | ブラウザ手動 |
| AC-3 | シーン概要の追加・削除・並び替え | ブラウザ手動 |
| AC-4 | LLMドラフト生成 + カード表示 | ブラウザ手動 + APIテスト |
| AC-5 | ドラフトカードの手動編集 | ブラウザ手動 |
| AC-6 | プロファイル一括作成 + 名称確認 | ブラウザ手動 + APIテスト |

---

## 1. 自動テスト (CLI Verification)

### 1-1. バックエンド単体テスト

```bash
cd backend
pytest tests/ -v -k "scene_generate"
```

**期待値:**
- `POST /api/llm-prompts/scene-generate` が 200 を返すこと
- レスポンスが `[{"scene_id": str, "diff_params": {...}}]` 形式であること

### 1-2. スキーマ検証テスト (新規テストケースの追加が必要)

`backend/tests/` に以下を追加:

```python
# test_scene_generate.py
def test_scene_generate_endpoint_returns_diff_params(client):
    payload = {
        "target_fields": ["Pose_text", "Expression_text"],
        "base_params": {"Pose_text": "standing", "Expression_text": "calm"},
        "scenes": [
            {"id": "scene-1", "summary": "大剣を背負って立っている"},
            {"id": "scene-2", "summary": "鋭く睨みつけながら構える"}
        ]
    }
    response = client.post("/api/llm-prompts/scene-generate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    for item in data:
        assert "scene_id" in item
        assert "diff_params" in item
        assert isinstance(item["diff_params"], dict)

def test_scene_generate_only_returns_target_fields(client):
    payload = {
        "target_fields": ["Pose_text"],
        "base_params": {"Pose_text": "standing"},
        "scenes": [{"id": "s1", "summary": "ポーズを変える"}]
    }
    response = client.post("/api/llm-prompts/scene-generate", json=payload)
    assert response.status_code == 200
    data = response.json()
    for item in data:
        for key in item["diff_params"]:
            assert key in payload["target_fields"], f"Unexpected field: {key}"
```

---

## 2. ツール主導監査

```bash
# OpenAPI エンドポイント確認
python ${GLOBAL_SCRIPTS}\openapi_parser.py backend/openapi.json list-endpoints | grep scene
```

**期待値:** `POST /api/llm-prompts/scene-generate` がリストされること

---

## 3. ブラウザ手動検証手順

**前提条件:**
- バックエンド起動済み (`uvicorn app.main:app --reload`)
- フロントエンド起動済み (`npm run dev`)
- ワークフローが最低1つ登録されている
- LLMサーバーが起動している（または `llm_base_url` が設定されている）

---

### TC-01: ボタン表示確認 (AC-1)

**手順:**
1. Generate ページを開く
2. ワークフローを選択する
3. プロファイルタブ行（Set タブが並ぶ行）を確認する

**判定基準:** `+ Add Set` ボタンの隣に `🎬 Scene` ボタンが表示されること  
**エビデンス:** スクリーンショット保存先: `.gemini/evidence/REQ-103/TC-01.png`

---

### TC-02: モーダル起動確認 (AC-1)

**手順:**
1. `🎬 Scene` ボタンをクリックする

**判定基準:**
- Scene Generator モーダルが表示されること
- モーダル背景（オーバーレイ）クリックでモーダルが閉じること  
**エビデンス:** `.gemini/evidence/REQ-103/TC-02.png`

---

### TC-03: 対象フィールド選択確認 (AC-2)

**手順:**
1. モーダルを開く
2. 対象フィールド選択エリアを確認する

**判定基準:**
- `input_type === 'textarea'` のフィールド（例: `Pose_text`, `Expression_text`）のみチェックボックスで表示されること
- 数値・select 系フィールドは表示されないこと
- チェックボックスのオン/オフが反映されること  
**エビデンス:** `.gemini/evidence/REQ-103/TC-03.png`

---

### TC-04: シーン概要の動的操作 (AC-3)

**手順:**
1. モーダルを開く
2. 「+ シーンを追加」ボタンをクリックし、2件目のテキストエリアが追加されることを確認
3. テキストエリアに日本語の概要を入力
4. 削除ボタンで1件目を削除
5. 2件以上ある場合、「上へ」「下へ」ボタンで順序を変更

**判定基準:**
- 追加・削除・並び替えが正常に動作すること
- 残り1件のシーンでは削除ボタンが disabled になること（オプション）  
**エビデンス:** `.gemini/evidence/REQ-103/TC-04.png`

---

### TC-05: ドラフト生成確認 (AC-4)

**手順:**
1. 対象フィールドを1つ以上チェックする
2. シーン概要を2件入力する（例: 「大剣を背負って立っている」「鋭く睨みつける」）
3. 「Generate Drafts」ボタンをクリックする

**判定基準:**
- ローディング表示が出ること
- LLM応答後、シーンカードが2枚表示されること
- 各カードに選択したフィールドの英語プロンプトが表示されること
- LLMが判断して不要と判断したフィールドはカードに表示されないこと（diff_params が空でも可）  
**エビデンス:** `.gemini/evidence/REQ-103/TC-05.png`

---

### TC-06: ドラフト手動編集確認 (AC-5)

**手順:**
1. TC-05 完了後の状態で、カード内のテキストエリアを編集する

**判定基準:**
- 編集した内容がリアルタイムで反映されること
- 他のカードに影響が出ないこと  
**エビデンス:** `.gemini/evidence/REQ-103/TC-06.png`

---

### TC-07: プロファイル一括作成確認 (AC-6)

**手順:**
1. TC-05/TC-06 完了後の状態で「プロファイルを作成」ボタンをクリックする

**判定基準:**
- モーダルが閉じること
- プロファイルタブ行に新しいプロファイル（Set タブ）が追加されること
- プロファイル名がシーン概要文（例: 「大剣を背負って立っている」「鋭く睨みつける」）であること
- 各プロファイルのパラメータが ベースパラメータ + 差分パラメータのマージ結果であること（プロファイルをクリックして確認）  
**エビデンス:** `.gemini/evidence/REQ-103/TC-07.png`

---

### TC-08: Zustand グローバル状態不変確認 (AC-6 付帯)

**手順:**
1. プロファイル作成前に React DevTools で `paramValues` の値を記録する
2. TC-07 を実行する
3. プロファイル作成後の `paramValues` を確認する

**判定基準:**
- `paramValues` の内容がモーダル操作前と一致すること（Scene Generator の値で上書きされていないこと）  
**エビデンス:** `.gemini/evidence/REQ-103/TC-08.png`

---

## 4. 必須エビデンス一覧

| ファイル名 | 対応 TC |
|---|---|
| `.gemini/evidence/REQ-103/TC-01.png` | ボタン表示 |
| `.gemini/evidence/REQ-103/TC-02.png` | モーダル起動 |
| `.gemini/evidence/REQ-103/TC-03.png` | フィールド選択 |
| `.gemini/evidence/REQ-103/TC-04.png` | シーン操作 |
| `.gemini/evidence/REQ-103/TC-05.png` | ドラフト生成 |
| `.gemini/evidence/REQ-103/TC-06.png` | 手動編集 |
| `.gemini/evidence/REQ-103/TC-07.png` | プロファイル作成 |
| `.gemini/evidence/REQ-103/TC-08.png` | 状態不変確認 |
