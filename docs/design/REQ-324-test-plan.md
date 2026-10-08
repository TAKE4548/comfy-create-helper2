# REQ-324 実行可能テスト計画

- **PBI ID**: REQ-324
- **Title**: Prompt Surgeon: フロントエンド肥大化モジュールおよびコンポーネントの構造分割整理 (api/client.ts & HistoryModalPreview)
- **Target Subsystem**: Frontend (`frontend/src/api/`, `frontend/src/components/history/`, `frontend/src/components/HistoryModalPreview.tsx`)

---

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **対象**: フロントエンド TypeScript 全体
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)
- **検証ポイント**:
  - `api/client.ts` が透過的 re-export ハブとして全既存型（`PromptMetadataRead`, `VramSettings`, 各種 Request/Response）を欠落なく公開していること
  - 新規作成される `PreviewHeader`, `PreviewImageViewer`, `SnapshotMetadataTab` と親コンポーネント間の Props 型定義の完全一致

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **対象**: 全体テストスイート回帰防止
- **コマンド**: `cd frontend; npm test`
- **期待値**: 135 テストファイル / 1284 テストすべて PASS (100% PASS, Exit code 0)
- **個別 TDD 実行コマンド**:
  - `cd frontend; npx vitest run src/api/core/__tests__/base.test.ts`
  - `cd frontend; npx vitest run src/api/__tests__/clientReExport.test.ts`
  - `cd frontend; npx vitest run src/components/__tests__/HistoryModalPreview.test.tsx`

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: API Core & Domains 後方互換性検証 (AC-1, AC-2, AC-3)
- **手順**:
  1. `frontend/src/api/core/base.ts` の `request<T>` を介した GET/POST/PATCH/DELETE 呼び出しが正常に JSON レスポンスをパースすることを確認。
  2. `204 No Content` および空ボディレスポンス時に `undefined` が正常返却されることを検証。
  3. `frontend/src/api/core/stream.ts` の `parseSceneSpeechEvent` が progress / result / error の各 NDJSON 行を正しくパース・分類することを確認。
  4. 既存の `src/api/__tests__/snapshotAssociations.test.ts` が一切の変更なしにそのまま PASS することを確認。

### シナリオ 2: HistoryModalPreview 分割後サブコンポーネント連携 (AC-4, AC-5)
- **手順**:
  1. `HistoryModalPreview` を開き、画像プレビューおよびインジケータ（1 / N）が表示されることを確認。
  2. `PreviewHeader` 上の WebP / PNG / JPEG 各ダウンロードリンクおよび一時画像ダウンロードリンクが生成されることを確認。
  3. 「Show info」ボタン押下時に `SnapshotMetadataTab` が展開され、`GenerationMetadataPanel` および `SnapshotTagAssociationsPanel` が正常描画されることを確認。
  4. タグ関連付け編集・保存実行時、保存中は画像送り（ArrowLeft/Right）およびモーダルクローズが正しくロックされ、完了後に反映されることを確認。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### 異常系 1: ストリームパース異常系 (NDJSON 不正フォーマット & 不明イベント)
- **手順**:
  - 不正な JSON 文字列、配列型 JSON、未知の `type`、未知の `error_kind` を `parseSceneSpeechEvent` に渡す。
- **期待結果**:
  - `Error('Invalid scene speech stream JSON line')`
  - `Error('Invalid scene speech stream event')`
  - `Error('Unknown scene speech stream event type')`
  各例外が確実に throw され、パースエラーの握りつぶしが発生しないこと。

### 異常系 2: HTTP 異常ステータス伝播 (4xx, 5xx, 空ボディ)
- **手順**:
  - fetch が 503 / 404 / 500 を返した際、レスポンスボディのエラーメッセージを含んだ `API error ${status}: ${detail}` が throw されること。
  - レスポンスが 204 No Content のとき、JSON パースエラーを起こさず `undefined` を解決すること。

### 異常系 3: HistoryModalPreview タグ保存中の操作試行遮断
- **手順**:
  - `snapshotsApi.patch` が pending 状態の間（保存中）に、モーダル外クリック・Escキー・閉じるボタン・次へ進むボタン押下を連続実行する。
- **期待結果**:
  - いずれのイベントも遮断され、`onClose` や `onChangeIndex` が呼び出されないこと（競合破損ゼロ）。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **BA 監査**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py ba-audit`
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`
