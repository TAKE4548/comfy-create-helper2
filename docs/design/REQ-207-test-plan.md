# REQ-207 テスト計画書

## 1. 事前準備: データベース保護・バックアップ (DB Safety Guard)

> [!CAUTION]
> **DBバックアップの必須実行**:
> E2Eテストや実動作確認を行う前に、既存データ（`db/prompt_surgeon.db`）の破損・意図しない変更を防止するため、必ずバックアップを取得します。

```powershell
# DBバックアップコマンド (PowerShell)
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
Copy-Item db/prompt_surgeon.db "db/prompt_surgeon.db.bak_$timestamp"
Write-Host "DB backup created: db/prompt_surgeon.db.bak_$timestamp"
```

---

## 2. 自動テスト (Unit / Regression Tests)

### 2.1 `useGenerationStore` 回帰テストスイート (`frontend/src/store/__tests/useGenerationStore.test.ts`)
- **WebSocket ライフサイクル・メッセージ処理**:
  - `progress`, `execution_start`, `executing`, `executed`, `execution_complete`, `execution_error`, `execution_interrupted` の各WSイベント受信時のステート遷移が従来通り正しく動作すること。
  - `_resetWebSocketForTesting` 呼び出しにより、WebSocketインスタンスおよび再接続タイマー、Promiseが安全にクリーンアップされること。
- **ジョブ投入 & キュー操作**:
  - `queuePrompt` の AbortSignal 制御、Prompt ID の永続化、メタデータ保存・古いメタデータ（>200件）の間引き処理が正常に実行されること。
  - `cancelJob`, `clearPendingQueue`, `cancelAllJobs` の楽観的ステート更新と ComfyUI API 呼び出しが正常に行われること。
- **マルチセット (Multi-Set) 管理**:
  - `initSets`, `addSet`, `removeSet`, `renameSet`, `toggleSetChecked`, `setAllSetsChecked`, `updateActiveSet`, `loadPresetData` のステート更新と LocalStorage 同期が正常に行われること。
- **バイパスプロファイル & パラメータ同期グループ**:
  - `fetchBypassProfiles`, `createBypassProfile`, `updateBypassProfile`, `deleteBypassProfile` の CRUD 操作と `bypassProfilesCache` の同期。
  - `fetchParamSyncGroups`, `createParamSyncGroup`, `updateParamSyncGroup`, `deleteParamSyncGroup`, `toggleParamSyncGroup` の CRUD 操作と `paramSyncGroupsCache` の同期。

### 2.2 全体リグレッションテスト (`npm test`)
- フロントエンド全テストスイート（38ファイル, 448テスト）がオールグリーンで通過すること。

---

## 3. 実行コマンド

```bash
# 1. 静的型チェック
npm run build

# 2. ストア単体 & スライステスト実行
npm run test -- frontend/src/store/__tests/useGenerationStore.test.ts

# 3. フロントエンド全テスト実行
npm test
```

---

## 4. 実機E2E・手動検証シナリオ (Manual / E2E Verification)

### 4.1 必須検証 5 大シナリオ
1. **リアルタイム生成・進捗パイプライン**:
   - 生成ボタンを押下し、ノード別進捗率、プレビュー画像（Blob）のリアルタイム更新、完了時の履歴リスト先頭追加が滑らかに動作すること。
2. **ジョブ中断・キュークリア**:
   - バッチ生成中に「中断」および「キュー全消去」を実行し、即座にUIが復帰してComfyUI側でもジョブが破棄されること。
3. **マルチセット & プロンプト連動**:
   - セットの新規追加、LoRA/タグの適用（プロンプト文字列への自動挿入）、タブ切り替え、F5リロード後も状態が完全に維持されること。
4. **バイパス設定 & パラメータ同期モーダル**:
   - `BypassSettingsModal` / `ParamSyncModal` を開き、新規追加・編集・トグル・削除を行ってUIおよびキャッシュが不整合なく同期すること。
5. **ネットワーク断線・自動再接続**:
   - ComfyUI の接続が切れた際に切断状態となり、復帰後に自動的に再接続してキューと履歴が復旧すること。
