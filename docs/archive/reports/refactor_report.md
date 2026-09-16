# リファクタリング・潜在デグレリスク監査レポート

**実施日時**: 2026-08-30  
**対象範囲**: `frontend/src` 全域（グローバル状態管理、生成ページフック群、コンポーネント、描画ユーティリティ、APIクライアント）  
**監査手法**: ローカルモデル（Qwen3.5）による静的コードスキャン、アーキテクチャ構造解析、およびデグレリスク抽出  

---

## 1. 監査の総評

本監査では、**「今後の機能拡張・改修時に予期せぬデグレ（退行バグ）を引き起こす潜在リスクが高い領域」**および**「AIエージェントのコンテキスト肥大化・推論ミスを誘発する認知負荷の高い領域」**を重点的に抽出しました。

全体の傾向として、機能の進化に伴い以下の5つの重大な構造的課題が蓄積しています。

1. **グローバル状態管理のモノリス化と外部シングルトンの癒着 (`useGenerationStore.ts`)**:
   - 1,700行を超えるストア内に、WebSocket通信、ジョブキュー、バイパス、パラメータ同期、マルチセット、LocalStorage永続化が混在。
   - Zustand外部のモジュールレベル変数（`ws`, `isInitializing`, `reconnectTimer` 等）による競合・メモリリーク・テスト困難性の潜在。
2. **ページ状態フックの肥大化と暗黙的イベント結合 (`useGeneratePageState.ts`)**:
   - 1,450行の巨大フックに40以上のローカル状態が集約され、微小な入力変化でページ全体の不要な再レンダリングが発生。
   - `window.dispatchEvent` 等の非宣言的イベントによる結合が存在し、修正時の影響範囲が不可視。
3. **ワークフローJSON操作ロジックの二重実装 (`useWorkflowParams.ts` & `useGenerateAction.ts`)**:
   - `easy loraStack` および標準 `loraStack` のパラメータ注入・スロット整理ロジックが2箇所に重複。仕様変更時に片方のみ修正されることによる保存データと生成実行時の乖離リスクが極めて高い。
4. **吹き出し描画サブシステムの過度な結合 (`SpeechBubbleControls.tsx` & `speechBubbleRenderer.ts`)**:
   - 幾何学演算（ベジエ/円弧）、文字組版（縦書き/横書き）、Canvas描画手続き、座標変換（0..1 vs 実ピクセル）が1つの巨大モジュールに同居。高解像度エクスポートや解像度変更時のクリッピング・歪みの温床。
5. **設定・履歴画面における非同期エラーリカバリの脆弱性 (`SettingsPage.tsx` & `HistoryPage.tsx`)**:
   - 一括ダウンロード等の長時間非同期処理において、例外発生時の状態リセット漏れによるUIフリーズリスク。

---

## 2. 重点ターゲット別の監査詳細とデグレリスク分析

### 2.1 グローバル状態管理: `useGenerationStore.ts` (1,709行)
- **潜在デグレリスク (High / P1)**:
  - **モジュールレベル変数の競合**: `let ws`, `let isInitializing`, `let reconnectTimer`, `activeSubmissionPromise` がストア外に存在するため、コンポーネントのマウント/アンマウントや再接続時に二重接続や古いPromise参照が発生する。
  - **二重キャッシュ管理の不整合**: `bypassProfilesCache`, `paramSyncGroupsCache` とローカルStateの二重保持により、APIエラー時や部分更新時にStaleデータが表示される。
  - **巨大アクションの副作用連鎖**: `reconcileState` や `initialize` に順次フェッチ、状態更新、LocalStorage書き込み、タイマー操作が直列に記述されており、エラー時のロールバック機構がない。
- **推奨リファクタリング**:
  - Zustand の Slices Pattern により、`connectionSlice`, `bypassSlice`, `paramSyncSlice`, `multiSetSlice`, `jobQueueSlice` に責務分割。
  - WebSocketの通信ライフサイクルを専用サービスへカプセル化。

### 2.2 生成ページ状態フック: `useGeneratePageState.ts` (1,453行)
- **潜在デグレリスク (High / P1)**:
  - **Stale Closures（古いクロージャの参照）**: 40以上のStateと多数のハンドラが1フックに集中しているため、非同期処理やイベントハンドラ内で古いStateを参照し、更新結果を上書きしてしまうリスク。
  - **不要再レンダリングの連鎖**: 全UI状態が1つのフックの返り値オブジェクトに含まれるため、スライダー操作等の高頻度イベントで無関係なモーダルやパネルがすべて再評価される。
  - **暗黙的イベント通信**: `window.addEventListener('tag-chip-editor:text-mode-toggle')` による結合があり、コンポーネントツリーの変更でイベントが脱落するリスク。
- **推奨リファクタリング**:
  - モーダル状態フック、レイアウト状態フック、アセット選択フック等へ関心事ごとに細分化。
  - イベント通信を明示的なストアアクションまたはコールバックへ統合。

### 2.3 パラメータ注入・ワークフロー操作: `useWorkflowParams.ts` & `useGenerateAction.ts`
- **潜在デグレリスク (High / P1)**:
  - **LoRAスタック注入の二重実装（DRY違反）**: `useWorkflowParams.ts:handleSaveDefaultParams` と `useGenerateAction.ts:injectParams` に約50行の同一ロジックが存在。新しいノード型やLoRA仕様変更時に片方のみ更新されると、デフォルト保存値と生成実行値が一致しなくなる。
  - **`bypassUtils.ts` の順序依存性**: 連続する複数ノードをバイパスする際、バイパス対象ノードの指定順序によってリンク付け替えが失敗し、ComfyUIで未接続エラーが発生するリスク。
- **推奨リファクタリング**:
  - 純粋関数モジュール `workflowParamInjector.ts` を新設し、パラメータ注入・LoRA展開を一元化。
  - バイパス処理の依存解決をトポロジカル順序で安全に実行。

### 2.4 吹き出し描画サブシステム: `SpeechBubbleControls.tsx` & `speechBubbleRenderer.ts`
- **潜在デグレリスク (High / P2)**:
  - **座標変換の丸め誤差とクリッピング**: 正規化座標（0..1）と実描画Canvas座標の変換が各関数内でアドホックに計算されており、アスペクト比変更時やエクスポート時に吹き出し位置・文字配置がずれる。
  - **幾何計算と描画手続きの混在**: ベジエ曲線の制御点計算とCanvas 2Dコンテキストへの `stroke()` / `fill()` が密結合しており、SVG出力や別レンダラー対応が極めて困難。
- **推奨リファクタリング**:
  - 幾何演算（Geometry）、文字組版（Typography）、Canvas描画（Renderer）の3層アーキテクチャへ分離。
  - `TransformContext` による一元的な座標系管理の導入。

### 2.5 設定・履歴画面: `SettingsPage.tsx` & `HistoryPage.tsx`
- **潜在デグレリスク (Medium / P2)**:
  - **非同期エラー時の状態フリーズ**: `HistoryPage.tsx` の一括ダウンロード等でネットワークエラー時に `isDownloading` が `true` のまま残り、画面操作不能になる。
  - **設定画面のモノリス化**: `SettingsPage.tsx` に6つの無関係な設定機能が混在し、1つの機能改修が他セクションのStateを巻き込む。
- **推奨リファクタリング**:
  - 設定セクションの独立コンポーネント化。
  - 非同期ダウンロード処理のカスタムフック化と確実な `finally` ブロックによる状態復旧。

---

## 3. High/Medium 優先度リファクタリング一覧と作成済みPBI

本監査に基づき、今後の改修安全性を担保するための5件のPBIをバックログに新規登録しました。

| PBI ID | タイトル | 優先度 | 対象ファイル | 主なデグレリスク |
| :--- | :--- | :--- | :--- | :--- |
| **REQ-207** | グローバル状態管理（useGenerationStore）の責務分離・スライス化およびWebSocketライフサイクルの疎結合化 | **P1 (High)** | `store/useGenerationStore.ts` | モジュール変数競合、キャッシュ不整合、単一障害点化 |
| **REQ-208** | 生成ページ状態フック（useGeneratePageState）のドメイン別分割およびStale Closure・再レンダリング防止 | **P1 (High)** | `GeneratePage/hooks/useGeneratePageState.ts` | Stale Closures、不要再描画、暗黙イベント結合 |
| **REQ-209** | ワークフローパラメータ解析・注入（LoRAスタック/バイパス）ロジックの共通化と二重実装排除 | **P1 (High)** | `useWorkflowParams.ts`, `useGenerateAction.ts`, `bypassUtils.ts` | **【対応完了】** `workflowParamInjector.ts` への一元化と推移的バイパスリンク解決を完了 |
| **REQ-210** | 吹き出し描画サブシステム（SpeechBubbleControls/Renderer）の幾何計算・組版・Canvas描画パイプラインの分離 | **P2 (Medium)** | `SpeechBubbleControls.tsx`, `speechBubbleRenderer.ts` | 座標変換の丸め誤差、クリッピング、描画歪み |
| **REQ-211** | 設定ページ・履歴ページのモノリス構造解体と非同期エラーリカバリ・プログレス管理の堅牢化 | **P2 (Medium)** | `SettingsPage.tsx`, `HistoryPage.tsx` | 非同期エラー時のUIフリーズ、モノリス画面の結合 |

---

## 4. 総括と推奨する移行ステップ

1. **ステップ1 (基盤保護: REQ-209 & REQ-207)**:
   - 最もデグレ時の影響が大きい「ワークフローパラメータ注入ロジックの共通化（REQ-209）」および「グローバルストアのスライス化（REQ-207）」を先行実施し、生成エンジンと通信の信頼性を確立します。
2. **ステップ2 (UI堅牢化: REQ-208)**:
   - 頻繁に改修が入る生成ページの状態フックを分割（REQ-208）し、新機能追加時の再レンダリング性能と型安全性を確保します。
3. **ステップ3 (機能サブシステムの構造化: REQ-210 & REQ-211)**:
   - 吹き出し描画エンジン（REQ-210）および設定/履歴画面（REQ-211）のレイヤ分離を進め、長期的な保守性を向上させます。
