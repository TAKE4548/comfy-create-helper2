# REQ-069 実行可能テスト計画: LoraStackの編集がワークフローに反映されない（キャラLoRAが変更されない）不具合

## 1. 自動テスト (Unit Tests)

### 1-1. テスト項目
`useGenerateAction.ts` 内の `injectParams` における `easy loraStack` 形式のパラメータインジェクションと不要なパラメータの削除・リセット挙動を検証する。

### 1-2. テストの実行コマンド
```bash
npm run test -- frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts
```

---

## 2. 手動検証 (Manual Verification)

### 2-1. 現象再現と確認
1. 生成ページにて `easy loraStack` ノードを含むワークフロー（例: `LoRAスタック` 等の役割を含むもの）を選択する。
2. LoRAスタックのパラメータにキャラLoRAを登録し、ウェイトを `0.8` などに設定して画像を生成（Generate）する。
3. ブラウザの開発者ツールで WebSocket (`/ws`) または送信された `/prompt` ペイロードのJSONデータを確認し、該当ノード（`easy loraStack` ノード）の inputs に正しいキー名で送信されていることを検証する。
   - 例: `num_loras` が `1`
   - 例: `lora_1_name` が `BunnyGarden/kana_iilustrious.safetensors`
   - 例: `lora_1_strength` が `0.8`
   - 例: 残りの `lora_2_name` 〜 `lora_10_name` が `'None'`
4. さらにLoRAを変更して生成を行い、送信データが再度新LoRAに置き換わっていること、および生成画像に変更が反映されていることを確認する。
