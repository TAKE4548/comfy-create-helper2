# REQ-424 実行可能テスト計画: 生成キューの単一キャンセル即時実行と3秒間アンドゥ機能

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend && npm run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `cd frontend && npm test`
- **対象サブシステム個別コマンド**:
  - Store系: `cd frontend && npm test src/store/__tests__/slices/jobQueueSlice.test.ts`
  - UI系: `cd frontend && npm test src/components/__tests__/JobManagementModal.test.tsx`
- **期待値**: 全テスト PASS (Exit code 0)。脳内推論代用は厳禁。

### Gate 3: シナリオ・境界値・Red Teaming検証
- **コマンド**:
  - `cd frontend && npm test src/components/__tests__/JobManagementModal.test.tsx -t "REQ-424"`
  - `cd frontend && npm test src/store/__tests__/slices/jobQueueSlice.test.ts -t "REQ-424"`
- **期待値**: 全境界値・異常系ケース PASS (Exit code 0)

---

## 2. テスト階層構造 (Execution Tier Hierarchy)

| Tier | レベル | 検証対象 | 実行方式・モック境界 |
|---|---|---|---|
| **Tier 1** | Unit (単体) | 単一キャンセル時の即時キュー除外処理（[REQ-424/AC-1]）、`jobQueueSlice` の Undo スナップショット退避・タイマー設定（[REQ-424/AC-2]）、復元再投入（[REQ-424/AC-3]）、確定破棄（[REQ-424/AC-4]）、一括キャンセル等の他操作との共存維持（[REQ-424/AC-5]） | `generationApi.cancelJob` をモック化し、インメモリ状態遷移を純粋検証 (Zero-GPU, < 5秒) |
| **Tier 2** | Integration (結合) | `JobManagementModal` におけるキャンセル押下 → 即時API発行 → Undo通知表示 → 復元クリック → キュー復帰 | jsdom 環境でのコンポーネントレンダリング、タイマー操作（`vi.useFakeTimers()`）、Store 連携検証 (< 10秒) |
| **Tier 3** | Scenario / E2E (シナリオ) | ユーザーの通常キャンセル即時確定シナリオ、3秒以内Undoシナリオ、連続キャンセル・一括キャンセル共存シナリオ | 複数ジョブ存在下での一連のインタラクションフロー検証 |

---

## 3. テスト配置計画 (Test Placement Plan [W-DD-PLACE])

新規テストファイルをチケット名（`*req424*` 等）で作成することは厳格に禁止する。
必ず既存のコロケーションテストファイルに `[REQ-424/AC-x]` タグ付きテストケースを追加・更新する。

| 対象機能 | 追記・改修先テストファイル | テストランナーケースID例 |
|---|---|---|
| Store / Undo状態管理 | `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | `it('[REQ-424/AC-1] cancelQueuedJobWithUndo immediately calls cancelJob without delay')`<br>`it('[REQ-424/AC-2] cancelQueuedJobWithUndo arms undo snapshot and starts 3s timer')`<br>`it('[REQ-424/AC-3] restoreCancelledJob re-queues original workflow and metadata')`<br>`it('[REQ-424/AC-4] dismissQueuedCancelUndo clears undo state leaving cancellation confirmed')` |
| UI / Modal連携 | `frontend/src/components/__tests__/JobManagementModal.test.tsx` | `it('[REQ-424/AC-1] immediately executes queued cancel on button click without pre-delay')`<br>`it('[REQ-424/AC-2] displays undo notification banner with 3-second timer on cancel')`<br>`it('[REQ-424/AC-3] restores cancelled job to queue when undo clicked within 3s')`<br>`it('[REQ-424/AC-4] dismisses undo notification and finalizes cancel after 3000ms or on explicit close')`<br>`it('[REQ-424/AC-5] preserves existing bulk cancel and running job abort behaviors without interference')` |

---

## 4. 受入基準 (AC) マッピングと階層別テストシナリオ (Red Team含む)

### 4.1 受入基準 (AC) とテストケース・メタデータマッピング
| AC番号 | 検証観点 (Given-When-Then) | レイヤー | 安定ランナーID / ケース名 |
|---|---|---|---|
| **AC-1** | 待機中ジョブの単一キャンセル操作時、3秒事前ディレイを挟まず即座にキューから除外・API実行されること | Integration | `[REQ-424/AC-1] immediately executes queued cancel on button click without pre-delay` |
| **AC-2** | キャンセル直後、「取り消し」ボタン付き通知UIが表示され3秒タイマーが開始すること | Integration | `[REQ-424/AC-2] displays undo notification banner with 3-second timer on cancel` |
| **AC-3** | 3秒以内に「取り消し」押下時、元の設定（ワークフロー・プロンプト・パラメータ）を保持してキューに即座に復帰すること | Unit / Integration | `[REQ-424/AC-3] restoreCancelledJob re-queues original workflow and metadata`<br>`[REQ-424/AC-3] restores cancelled job to queue when undo clicked within 3s` |
| **AC-4** | 取り消しを行わず3秒経過または明示的閉じる操作で通知UIが閉じ、キャンセル確定状態が維持されること | Integration | `[REQ-424/AC-4] dismisses undo notification and finalizes cancel after 3000ms or on explicit close` |
| **AC-5** | 一括キャンセル（全件キャンセル）や実行中ジョブ中断が阻害されず既存動作を維持すること | Integration | `[REQ-424/AC-5] preserves existing bulk cancel and running job abort behaviors without interference` |

### 4.2 Tier 3: Red Teaming & 境界値・異常系 (Gate 3 Baseline)
1. **タイマー有効期限境界 (2999ms vs 3001ms)**:
   - **テストケース**: `[RedTeam] timer boundary check: undo succeeds at 2999ms but expires at 3001ms`
   - **手順**: 単一キャンセル実行後、`vi.advanceTimersByTimeAsync(2999)` で「取り消し」をクリックして復元成功を確認。再度実行し `3001ms` 経過後は通知UIが消去されUndo不可（確定状態）となることを確認。
   - **期待結果**: 3000msの有効期限境界において、2999msでは復帰成功、3001msでは失効確定が決定論的に担保されること。
2. **キャンセルAPI障害時の耐障害性**:
   - **テストケース**: `[RedTeam] cancel API failure handles error cleanly without orphan state`
   - **手順**: `generationApi.cancelJob` が503エラーまたは例外を返した状態で待機ジョブの削除ボタンを押下。
   - **期待結果**: エラートーストを表示し、未確定のUndoスロットを武装せず安全にフォールバックすること。
3. **復元再投入API障害時の耐障害性**:
   - **テストケース**: `[RedTeam] restore failure handles API error cleanly`
   - **手順**: Undo通知表示中に「取り消し」を押下し、キュー再投入API（`queuePrompt`）が例外を返した場合を検証。
   - **期待結果**: アプリケーションがクラッシュせずエラートーストを表示し、キュー同期を実行して最新状態を維持すること。
4. **連続キャンセル時の競合防止**:
   - **テストケース**: `[RedTeam] successive cancellations overwrite undo slot safely`
   - **手順**: ジョブAをキャンセル後、1秒以内にジョブBをキャンセル。
   - **期待結果**: 先行するジョブAのタイマーが直ちに解除され、最新のジョブBがUndoスロットにセットされて新たな3秒タイマーが開始されること。
5. **一括キャンセル・緊急停止との非干渉**:
   - **テストケース**: `[RedTeam] bulk cancel and running abort execute without interference from undo state`
   - **手順**: Undo通知表示中に一括キャンセル確認モーダルから全件キャンセルを実行、および実行中ジョブ中断確認から緊急停止を実行。
   - **期待結果**: 既存の確認ダイアログ仕様・API呼び出し順序が阻害されず全件キャンセル・緊急停止が実行され、Undoスロットがクリアされること。

---

## 5. リスク評価と強制全件フォールバック基準 (Risk Assessment & Fallback Triggers)

### 6.1 リスク分類
- **リスク度**: **Low Risk (低リスク)**
- **判定理由**:
  - 本改修はフロントエンド（`frontend/src/store/slices/jobQueueSlice.ts`, `frontend/src/components/JobManagementModal.tsx`）のUI/Store状態遷移改善に閉起しており、バックエンドAPIスキーマ、DBマイグレーション、認証・権限、インフラストラクチャ、共有フィクスチャへの変更は一切含まない。

### 6.2 強制全件フォールバックトリガー (Mandatory Full-Suite Fallback Triggers)
以下のいずれか1つでも該当した場合（OR条件）、スコープ限定検証は即時取り消され、Gate 2においてフルテストスイート（`npm test` 全件実行）の再実行が義務付けられる：
1. **高リスク領域への波及**: `backend/` 配下、DBスキーマ、認証/権限、または `src/api/schema.ts` への変更が検知された場合。
2. **テスト収集の不整合**: テスト件数の減少、予期せぬテストのskip、または空のテストコレクションが検知された場合。
3. **セマンティック/モック欠陥**: テストを通過させるための内部ロジックモンキーパッチや循環アサーションが発見された場合。
4. **型エラーの発生**: Gate 1（`npm run typecheck`）で1件でも型エラーが報告された場合。
5. **原因不明のテスト失敗・フレーキーテスト**: 環境依存やタイミング起因の不安定なテスト結果が検出された場合。

