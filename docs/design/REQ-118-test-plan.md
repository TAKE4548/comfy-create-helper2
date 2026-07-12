# REQ-118 テスト計画書: 生成済み画像へのセリフ付与機能

## テスト環境前提条件
- バックエンド: `uvicorn app.main:app --reload` が起動済み
- フロントエンド: `npm run dev` が起動済み
- LM Studio: ローカル起動済み、VLM対応モデル (例: LLaVA, Qwen-VL など) がロード済み
- スナップショット: 吹き出し付きの生成画像が少なくとも1件保存済み

---

## テストケース一覧

### TC-1: 吹き出し自動検出 (AC-2-1)
```bash
# 検証コマンド (スナップショットID=1 を仮定)
curl -X POST http://localhost:8000/api/snapshots/1/detect-bubble
```
**期待レスポンス:**
```json
{ "bounding_box": { "x": <int>, "y": <int>, "w": <int>, "h": <int> }, "confidence": <float> }
```
**失敗シナリオ:** 吹き出しが存在しない画像で `"bounding_box": null` が返ること。

---

### TC-2: ROI 指定による手動補正 (AC-2-2)
```bash
curl -X POST http://localhost:8000/api/snapshots/1/detect-bubble-roi \
  -H "Content-Type: application/json" \
  -d '{"roi": {"x": 100, "y": 50, "w": 200, "h": 100}}'
```
**期待:** ROI 内の最大輪郭の BoundingBox が返ること。

---

### TC-3: セリフドラフト生成 (AC-3-1/3-2/3-3)
```bash
curl -X POST http://localhost:8000/api/llm-prompts/speech-draft \
  -H "Content-Type: application/json" \
  -d '{"snapshot_id": 1}'
```
**期待:** `{ "draft": "<非空文字列>" }` が返ること。

---

### TC-4: 加工画像の保存 (AC-1-4)
```bash
# Step1: 画像アップロード
curl -X POST http://localhost:8000/api/snapshots/upload \
  -F "file=@/path/to/edited_image.png"
# Step2: スナップショット作成
curl -X POST http://localhost:8000/api/snapshots \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": 1, "params": {}, "image_path": "<step1のパス>", "source_snapshot_id": 1}'
```
**期待:** 新規スナップショットが作成され、一覧に表示されること。

---

### TC-5: 設定画面 - VLM/LLM設定の保存 (AC-4-1)
```bash
curl -X PUT http://localhost:8000/api/llm-prompts/speech_draft_vlm_model \
  -H "Content-Type: application/json" \
  -d '{"content": "llava-1.5-7b"}'
curl -X GET http://localhost:8000/api/llm-prompts
```
**期待:** `speech_draft_vlm_model` キーの `content` が更新されていること。

---

### TC-6: 境界条件テスト
- 吹き出しが複数存在する場合 → 最大面積の吹き出しが選択されること
- 入力テキストが空の状態で保存しようとした場合 → フロントエンドでバリデーションエラーが表示されること
- LM Studio が停止中に「ドラフト生成」を押した場合 → HTTP 500 エラーが UI に表示されること
