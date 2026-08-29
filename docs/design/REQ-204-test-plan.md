# REQ-204: セリフLLM変換における画像コンテキストおよび画像別場面ヒント付与・反映機能（マルチモーダル対応・単体/一括での画像別シーン説明入力） テスト計画書

## 1. テスト概要 (Overview)

本テスト計画は、REQ-204で実装される「セリフLLM変換における画像マルチモーダル連携、単体編集および一括変換での画像別場面ヒント入力・反映機能、自動フォールバック、およびコンテキスト保持機能」の受入基準（AC-1 〜 AC-5）を網羅的・決定論的に検証するための自動テストおよび手動確認手順を定義する。

---

## 2. 受入基準 (AC) とテストカバレッジ対応表

| 受入基準 (AC) | 決定論的検証内容 (Expected Criteria) | テストケース / コマンド |
|---|---|---|
| **AC-1**: 単体編集での画像参照 & 場面ヒント入力・反映 | 単体編集モーダルで画像参照ONおよび場面ヒントを入力して変換実行時、APIリクエスト（`include_image: true`, `scene_hint: "..."`）が送信され、Base64画像データとヒントを含むプロンプトがLLMへ渡され 200 OK で結果がUIに反映されること | `SpeechBubbleControls.test.tsx`, `test_speech_tone_presets.py` |
| **AC-2**: 一括変換での統合リスト画面における画像別場面ヒント入力 | 候補選択後の統合リスト画面（Screen 2: review）で各選択画像カードに場面ヒントを入力して「一括変換を開始」実行時、`POST /api/speech-batch/jobs` の各アイテムに `scene_hint` / `include_image` が設定されて 201 Created でジョブが作成されること | `BatchSpeechTransformModal.test.tsx`, `test_speech_batch.py` |
| **AC-3**: プロンプト合成 & 画像表情・状況の解釈 | 画像Base64データ（`image_url`）および場面ヒント（`【場面の状況・ヒント】`）がOpenAI互換マルチモーダルプロンプトにエンコードされてLLM呼び出しが行われ、返却されたセリフ文字列がレスポンスに反映されること | `test_speech_tone_presets.py`, `test_speech_batch.py` |
| **AC-4**: 自動フォールバック & 非マルチモーダル互換 | `include_image: false` / ヒント空文字の際、テキストのみのペイロードが構築されること。またVision呼び出しで400エラーが返却された場合でも自動フォールバックによりテキストのみで再試行されて 200 OK のレスポンスが返却されること | `test_speech_tone_presets.py`, `test_speech_batch.py` |
| **AC-5**: バッチジョブ・再生成時のコンテキスト保持 | `POST /api/speech-batch/jobs/{job_id}/items/{item_id}/retry` 実行時、アイテム内の `scene_hint` および `include_image` が保持された状態でワーカーが再実行され、同一コンテキストでLLM呼び出しが行われること | `test_speech_batch.py`, `BatchSpeechTransformModal.test.tsx` |

---

## 3. 自動テスト実行手順 (Automated Test Execution)

### バックエンド単体テスト
```bash
# 前提: pytest実行環境（テスト用DB/モック使用）
pytest backend/tests/test_speech_tone_presets.py backend/tests/test_speech_batch.py -v
```

### フロントエンド単体・統合テスト
```bash
# REQ-204 関連コンポーネントのテスト実行
npm test -- frontend/src/components/__tests__/SpeechBubbleControls.test.tsx frontend/src/components/__tests__/BatchSpeechTransformModal.test.tsx
```

---

## 4. 手動検証シナリオ (Manual Verification Scenario)

### シナリオ1: 単体セリフ編集での画像マルチモーダル & 場面ヒント口調変換
1. **操作**: 吹き出し編集モーダルを開き、口調変換アコーディオンを展開。「画像を参照する (Vision)」チェックボックスをONにし、「場面のヒント・状況説明」に「照れて顔を赤らめながら強がっている」と入力。
2. **実行**: 「口調変換 (LLM)」ボタンをクリック。
3. **判定基準**:
   - ネットワークタブで `POST /api/speech-tone-presets/rewrite` に `{ include_image: true, scene_hint: "照れて顔を赤らめながら強がっている", snapshot_id: <ID> }` が送信されること。
   - レスポンス 200 OK とともに、プレビュー領域に変換前後の差分が表示されること。
   - 「反映」ボタンをクリックして吹き出しのテキストが更新されること。

### シナリオ2: 一括セリフ変換での統合リスト画面での画像別場面ヒント指定・一括変換・再生成
1. **操作**: 履歴ページ上部の「セリフ一括変換」ボタンをクリックし、候補画像一覧を表示。変換対象の画像・吹き出しを選択し、「次へ：変換リストへ進む」をクリック。
2. **統合リスト画面**: 選択した画像がリスト表示されていることを確認。画像1の場面ヒントに「敵に囲まれて焦っている」、画像2の場面ヒントに「耳元で優しく囁いている」と入力し、「一括変換を開始」をクリック。
3. **判定基準**:
   - ネットワークタブで `POST /api/speech-batch/jobs` に各画像の `scene_hint` と `include_image: true` が含まれること（HTTP 201 Created）。
   - 同一画面上で進捗バーが進行し、各吹き出しの変換後セリフが順次差分プレビュー表示されること。
   - 画像1の任意の吹き出しカードで「再生成」ボタンをクリックした際、`POST /api/speech-batch/jobs/{job_id}/items/{item_id}/retry` が発行され、該当アイテムが再変換されること（HTTP 200 OK）。

### シナリオ3: 画像参照OFFおよび未入力時の通常動作・フォールバック
1. **操作**: 単体編集画面または一括変換統合画面で「画像を参照する (Vision)」チェックボックスをOFFにし、場面ヒントを空のまま変換を実行。
2. **判定基準**:
   - リクエストの `include_image` が `false` となり、エラーログなく 200 OK でテキストのみの口調変換結果が返却されること。
