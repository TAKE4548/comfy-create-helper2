# PBI-REQ-033 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `python -m pytest backend/tests/test_snapshots.py`
- **期待値**: 全テストケースが PASS すること。
- **追加テスト実装指示**: 
  以下のモックを用いたテスト関数 `test_create_snapshot_downloads_image` を `backend/tests/test_snapshots.py` に新規追加してください。
  ```python
  def test_create_snapshot_downloads_image(self):
      # ダミー画像を提供する外部 URL を指定してスナップショットを作成
      payload = {
          "workflow_id": self.workflow.id,
          "image_path": "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png",
          "params": {},
          "loras": [],
          "tag_sets": []
      }
      # HTTP リクエストをモックし、ダミーデータを返すように設定
      import urllib.request
      from unittest.mock import patch, MagicMock
      
      mock_response = MagicMock()
      mock_response.read.return_value = b"fake image content"
      mock_response.__enter__.return_value = mock_response
      
      with patch('urllib.request.urlopen', return_value=mock_response):
          response = self.client.post("/api/snapshots", json=payload)
          self.assertEqual(response.status_code, 201)
          data = response.json()
          
          # 相対パスへの変換アサーション
          self.assertTrue(data["image_path"].startswith("/api/snapshots/images/"))
          self.assertTrue(data["image_path"].endswith(".png"))
  ```

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py` を用いた適合度監査が実行できること。

## 3. API 機能検証 (Programmatic Verification)
※ブラウザ操作は廃止し、Python スクリプトによる直接検証を行う。

- **検証スクリプト (scratch/verify_req_033.py)**:
  以下の Python コードをスクリプトとして実行し、検証結果を確認します。
  
  ```python
  import requests
  import sys
  
  def run_verification():
      # 1. ダミー画像 URL
      dummy_url = "https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png"
      
      # 2. リクエスト送信
      print("Testing POST /api/snapshots...")
      response = requests.post(
          "http://localhost:8000/api/snapshots", 
          json={
              "workflow_id": 1, # 存在するワークフローIDに合わせる
              "image_path": dummy_url,
              "params": {}
          }
      )
      
      assert response.status_code == 201, f"Expected 201, got {response.status_code}"
      data = response.json()
      returned_path = data['image_path']
      print(f"Returned path: {returned_path}")
      
      # 3. 相対パスの検証
      expected_prefix = "/api/snapshots/images/"
      assert returned_path.startswith(expected_prefix), f"Path mismatch: {returned_path}"
      
      # 4. ダウンロード検証
      print("Testing GET static mounted image...")
      download_response = requests.get(f"http://localhost:8000{returned_path}")
      assert download_response.status_code == 200, "Downloaded image failed"
      
      print("All assertions passed.")

  if __name__ == "__main__":
      try:
          run_verification()
      except Exception as e:
          print(f"Verification Failed: {e}")
          sys.exit(1)
  ```

- **期待結果**: スクリプト実行時に `All assertions passed.` が出力され、正常終了すること。


