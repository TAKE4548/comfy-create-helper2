# PBI-REQ-119 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `pytest backend/tests/test_snapshots.py`
- **期待値**:
  - `test_detect_bubble_endpoints` を含む、すべてのテストがPASSすること。
  - テストコード内に新規追加する以下のテストケースがすべてPASSすること：
    - ダミー吹き出し（100x100px）に対して、ROIを小さく指定（例: 50x50px）した状態で吹き出しが正常に検出されること。
    - ROIの境界が吹き出しを一部カットする（境界との接触・交差）状態で、吹き出しが正常に検出されること。
    - ROIが吹き出し領域から完全に外れている（例: 画像左上の空きスペースを指定）場合に、検出結果が `None` になること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py summarize` もしくは適切な監査ツールを用いて、コード差分の品質をチェックする。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173/` (フロントエンドUI)
- **操作手順**:
  1. フロントエンドでスナップショットの「吹き出し編集」モーダル（`SpeechBubbleEditorModal`）を開く。
  2. 吹き出しがある領域を小さくドラッグ指定（ROI指定）する。
  3. 吹き出しのない空領域をドラッグ指定する。
- **判定基準 (Assertion)**:
  - 吹き出し領域を指定した際、吹き出し全体を囲む赤いバウンディングボックスが表示されること（中心のずれが画像描画上で許容範囲内であること）。
  - 空領域を指定した際、警告アラート「ROI指定範囲内に吹き出しを検出できませんでした。」が1回表示されること。
- **必須エビデンス**:
  - ROIによる吹き出し検出が成功した状態のブラウザスクリーンショットを `.gemini/antigravity/browser_recordings/REQ-119-success.png` に保存する。
  - 検出失敗のアラートが表示された状態のブラウザスクリーンショットを `.gemini/antigravity/browser_recordings/REQ-119-fail.png` に保存する。
