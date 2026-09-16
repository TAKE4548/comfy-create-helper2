# インシデントレポート: ビルド後FEにおける非アクティブ放置時のComfyUI接続切断および自動再接続不全

**日時**: 2026-09-16  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `frontend/src/store/slices/connectionSlice.ts`（WebSocket 切断・再接続ハンドリング）
- `frontend/src/store/services/comfyWebSocketService.ts`（WebSocket ライフサイクル・タイマー管理）
- `frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts`（画面表示・タブ復帰イベント）
- `frontend/src/hooks/useComfyWebSocket.ts`（URL 解決ロジック `resolveComfyUrl`）
**分類**: **Type A（実装バグ）**

---

## 1. 症状

- **事象**: `npm run build` でビルドしたフロントエンド（FastAPI 単一プロセス配信、Port 8000）において、ブラウザタブを非アクティブ（バックグラウンド化・別ウィンドウ操作・スリープ等）にしてしばらく放置すると、ComfyUI との WebSocket 接続が切断される（ヘッダー横の接続インジケーターが緑からグレーに変わり、生成ボタンが無効化される）。
- **継続事象**: 画面を手動でリロード（F5）すると即座に再接続されるが、明示的にリロードしない限り切断された状態（未接続）のまま維持され、自動復帰しない。
- **対比事象**: Vite 開発サーバー稼働時（Port 5173）で運用していた頃は、同様の非アクティブ放置を行ってもこの問題は発生しなかった。
- **再現ステップ**:
  1. `frontend/` でビルドを行い、FastAPI バックエンドから単一プロセスで配信（`http://localhost:8000`）。
  2. ブラウザで生成画面（GeneratePage）を開き、ComfyUI 接続インジケーターが緑色（`isConnected: true`）であることを確認する。
  3. タブを非アクティブにする（他タブへの切り替え、またはブラウザの最小化）か、端末を一定時間放置する（5分以上）。
  4. 再度 Prompt Surgeon のタブをアクティブにして画面を確認する。
  5. **結果**: ComfyUI 接続インジケーターがグレー（未接続）となり、生成ボタンが無効化されたまま復帰しない。待機しても再接続されず、F5 リロードを行うまで切断状態が継続する。

---

## 2. ログ・エビデンス

### エビデンス①: `logs/app.jsonl` の調査結果
- `python scripts/inspect_logs.py --summary` および `python scripts/inspect_logs.py --errors --tail 10` を実行。
- 総エントリー数 13,470 件。直近のエラーは過去のプリセット更新時の SQLite ロック例外のみであり、バックエンド API（FastAPI）や ComfyUI プロキシのクラッシュ・例外は記録されていない。
- したがって、サーバープロセスのダウンではなく、フロントエンド側の WebSocket 接続維持および切断回復ロジックの不備であることを確認。

### エビデンス②: WebSocket 切断・再接続ハンドリングの欠落と単一タイマーの脆弱性
[`frontend/src/store/slices/connectionSlice.ts`](frontend/src/store/slices/connectionSlice.ts)（L150-L163）:
```ts
          onClose: () => {
            set({ isConnected: false })
            if (!comfyWsService.getReconnectTimer()) {
              const timer = setTimeout(() => {
                comfyWsService.setReconnectTimer(null)
                get().initialize()
              }, 3000)
              comfyWsService.setReconnectTimer(timer)
            }
          },
          onError: () => {
            set({ isConnected: false })
          },
```
- **`onError` での再接続未スケジュール**: WebSocket 通信でエラー（`onError`）が発生した場合、`set({ isConnected: false })` を行うのみで、再接続タイマー（`comfyWsService.setReconnectTimer`）が一切スケジュールされない。
- **ブラウザバックグラウンドタイマーの制約**: Chromium 系ブラウザでは、非アクティブタブ（バックグラウンドタブ）において `setTimeout` などのタイマーが省電力のために最低1分間隔へと強制スロットリング、あるいはタブサスペンドによって一時停止される。
- **リトライ失敗時のデッドロック**: 一度切断された後、非アクティブ中に再接続試行が失敗または中断した場合、`comfyWsService.connect()` 内で例外が発生しても `onError` 経由では再接続が再試行されず、後続のタイマーが存在しないため永久に切断状態が維持される。

### エビデンス③: タブ復帰時（VisibilityChange / Focus）における WebSocket 再接続の欠落
[`frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts`](frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts)（L235-L248）:
```ts
  // Visibility / focus refresh
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        store.fetchQueue()
        store.fetchHistory()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [store])
```
- タブが再度アクティブ（`visibilitychange` / `window focus`）になった際、REST API のキュー照会（`store.fetchQueue()`）と履歴照会（`store.fetchHistory()`）のみが実行されている。
- **WebSocket 接続状態の確認（`store.isConnected`）や再接続（`store.initialize()`）が完全に欠落**しており、非アクティブ中に WebSocket が切断された場合、画面に戻っても再接続がトリガーされない。

### エビデンス④: Vite 開発サーバー環境との構造的差異（なぜ Vite では起きなかったか）
1. **HMR（Hot Module Replacement）ハートビートの有無**:
   - Vite 開発サーバー稼働時（Port 5173）は、Vite 内部のクライアント（`@vite/client`）が常時 WebSocket で約30秒間隔の Ping/Pong ハートビートを送受信している。
   - このためブラウザのバックグラウンドタブが完全なアイドル状態とみなされず、TCP 接続やタイマーのスロットリングが緩和されていた。
2. **プロキシ経路の差異**:
   - Vite 稼働時は [`frontend/src/hooks/useComfyWebSocket.ts` L66-L74](frontend/src/hooks/useComfyWebSocket.ts#L66-L74) により `ws://localhost:5173/comfy/ws`（同一起源の Vite プロキシ）へ接続していた。
   - 一方、ビルド後の単一プロセス配信環境では同ファイル L52-L64 により ComfyUI 直接待受ポート（`ws://127.0.0.1:8188/ws`）へクロスポートで直接接続している。
   - ComfyUI の標準 WebSocket サーバーはアイドル時にハートビートフレームを送信しないため、単一プロセス運用下では長時間の無通信（アイドル）によって OS や Chromium の TCP キープアライブ/アイドルソケットクリーンアップにより容易に切断が発生する。

### エビデンス⑤: 仕様書（`SPEC_GENERATE.md`）との乖離
[`docs/specs/SPEC_GENERATE.md`](docs/specs/SPEC_GENERATE.md) 第4節（L194-L196）:
```markdown
- **WebSocket 切断回復**:
  - 切断検知時、指数バックオフで自動再接続を試行。
  - 再接続時、`/api/comfy/queue` を照会して進行中ジョブを再検知し、進捗バー・プレビューに自動復帰する。
```
- 仕様書には「**切断検知時、指数バックオフで自動再接続を試行**」と明記されているが、実装コード（`connectionSlice.ts`）は単一の固定3秒 `setTimeout` のみとなっており、指数バックオフやエラー時の堅牢な再試行ループ、タブ復帰時の再接続保証が実装されていない。

---

## 3. 根本原因分析（Root Cause Analysis）

### 根本原因: 単一プロセス配信下でのハートビート機構の欠如、および `connectionSlice` / `useGenerateDisplayState` における切断検知・タブ復帰時再接続ハンドリングの不備

**該当箇所**:
1. [`frontend/src/store/slices/connectionSlice.ts` L150-L163](frontend/src/store/slices/connectionSlice.ts#L150-L163)（`onError` での再接続未スケジュール、単一固定タイマーの脆弱性）
2. [`frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts` L235-L248](frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts#L235-L248)（タブ復帰時の WebSocket 再接続トリガー漏れ）
3. [`frontend/src/store/services/comfyWebSocketService.ts` L73-L120](frontend/src/store/services/comfyWebSocketService.ts#L73-L120)（定期的なキープアライブ・ハートビート ping 機構の不在）

#### 発生メカニズム:
1. **無通信切断の発生**: ビルド後環境（Port 8000）では Vite の HMR ハートビートが存在せず、ComfyUI の直接 WebSocket（Port 8188）に対してもアプリケーション層のキープアライブ（Ping）が送信されていないため、非アクティブ放置時に Chromium や OS のアイドルソケット回収により TCP 接続が切断される。
2. **再接続ループの停止**: 切断時または切断前後に `onError` が発生した場合、再接続タイマーがセットされない。また、非アクティブ中にセットされたタイマーが Chromium の省電力スロットリングやサスペンドによって遅延・阻害された際、再接続試行が失敗すると以降の再接続トリガーが失われる。
3. **タブ復帰時の未回復**: ユーザーがタブに戻った際、`useGenerateDisplayState.ts` は REST API（`fetchQueue`, `fetchHistory`）のみを呼び出し、WebSocket が切断状態（`isConnected: false`）であっても `initialize()` を実行しないため、手動リロード（F5）を行わない限り切断状態が継続する。

---

## 4. 診断チェック（Diagnostic Check）

| 項目 | 判定結果 | 詳細 |
|---|---|---|
| **Root_Cause_Isolated** | **Yes** | `connectionSlice.ts`（L150-163）、`useGenerateDisplayState.ts`（L235-248）、およびキープアライブ不在を特定 |
| **Classification** | **Type A: Implementation Bug** | 仕様書（`SPEC_GENERATE.md` 第4節「切断検知時の自動再接続」）で規定された切断回復要件を満たしていない実装不備 |
| **影響スコープ** | フロントエンド単体 | `connectionSlice.ts`, `comfyWebSocketService.ts`, `useGenerateDisplayState.ts` |
| **禁止事項遵守** | 遵守 | 調査フェーズ（Read-Only）を厳守し、コード改変や修正提案は実施せず |

---

## 5. 次のアクション

根本原因の特定が完了しました。  
本件は仕様（`SPEC_GENERATE.md`）で規定された切断回復設計に対する実装不足に起因する **Type A（実装バグ）** であるため、バックログに不具合修正 PBI を登録した上で、`/dev-design` へ移行して修正設計を行うことを推奨します。
