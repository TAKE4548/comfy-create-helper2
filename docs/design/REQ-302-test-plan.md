# REQ-302 実行可能テスト計画: 未統一オーバーレイの前面化と不要なナビ回避余白の解消

## 1. 自動テスト Baseline 検証 (CLI Baseline Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend && npm run typecheck`
- **期待値**: エラー 0 件 (Exit code 0)。TypeScript 型定義の不整合が一切ないこと。

### Gate 2: フルテストスイート完全ディスカバリ (Full-Suite Baseline)
- **コマンド**: `cd frontend && npm test`
- **対象サブシステム個別コマンド**:
  - Modal基底 & CSS: `cd frontend && npm test src/components/common/__tests__/Modal.test.tsx`
  - AppShellナビ遮蔽: `cd frontend && npm test src/components/layout/__tests__/AppShell.test.tsx`
  - プリセット競合: `cd frontend && npm test src/components/__tests__/PresetConflictModal.test.tsx`
  - 画像シート例外: `cd frontend && npm test src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx`
  - Studioモーダル群: `cd frontend && npm test src/pages/DatasetStudioPage/components/__tests__/CreateProjectModal.test.tsx src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx src/pages/DatasetStudioPage/__tests__/BenchmarkGrid.test.tsx`
  - History削除確認: `cd frontend && npm test src/pages/__tests__/HistoryPage.test.tsx`
  - プレビュー閲覧: `cd frontend && npm test src/components/__tests__/HistoryModalPreview.test.tsx`
  - ネスト例外: `cd frontend && npm test src/components/__tests__/WorkflowNodePicker.test.tsx`
- **期待値**: 全テスト PASS (Exit code 0)。ファイルフィルタなしのフルスイート実行で120+テスト全PASS。

### Gate 3: シナリオ・境界値・Red Teaming検証
- **コマンド**: `cd frontend && npm test src/components/layout/__tests__/AppShell.test.tsx src/components/common/__tests__/Modal.test.tsx src/components/__tests__/PresetConflictModal.test.tsx -t "REQ-302"`
- **期待値**: 全境界値・異常系ケース PASS (Exit code 0)

---

## 2. テスト階層構造 (Execution Tier Hierarchy)

| Tier | レベル | 検証対象 | 実行方式・モック境界 |
|---|---|---|---|
| **Tier 1** | Unit (単体) | `.modal-backdrop` CSSパディング・余白撤廃（[REQ-302/AC-2]）、768〜1023px レスポンシブ均等パディング（[REQ-302/AC-2]）、safe-area Inset と 0px フォールバック（[REQ-302/AC-5]）、デスクトップ中央配置・幅上限（[REQ-302/AC-6]） | jsdom 環境での純粋なスタイル・プロパティ計算検証 (Zero-GPU, < 5秒) |
| **Tier 2** | Integration (結合) | `Modal.tsx` 共通統合による Focus Trap・Escape制御・Backdropクリック（[REQ-302/AC-3]）、各画面モーダル（Generate, PresetConflict, CreateProject, NodeRemap, BenchmarkCell, HistoryDelete）の前面描画（[REQ-302/AC-1]）、画像閲覧例外（MobileImageSheet, HistoryModalPreview）の維持（[REQ-302/AC-6]）、ネスト例外（WorkflowNodePicker）のEscape単独制御（[REQ-302/AC-4]） | API通信は MSW / vi.mock で transport 境界遮断、コンポーネントレンダリング検証 (< 15秒) |
| **Tier 3** | Scenario / Red Team | モバイル前面オーバーレイ展開時のボトムナビへのタップ遮断・ルーティング非遷移（[REQ-302/AC-1]）、高速連続タップ遮断（RT-1）、多重Escape耐性（RT-2）、仮想キーボード縮小時のアクション到達性（[REQ-302/AC-5]） | ユーザー操作フローおよび境界値・異常系検証 (< 20秒) |

---

## 3. テスト配置計画 (Test Placement Plan [W-DD-PLACE])

新規テストファイルをチケット名（`*req302*` 等）で作成することは厳格に禁止する。必ず既存のコロケーションテストファイルに `[REQ-302/AC-x]` タグ付きテストケースを追加・更新する。

| 対象画面 / 機能 | 追記・改修先テストファイル | テストランナーケースID例 |
|---|---|---|
| 共通Modal & `.modal-backdrop` | `frontend/src/components/common/__tests__/Modal.test.tsx` | `it('[REQ-302/AC-1] modal backdrop renders with z-[var(--z-modal)] and obscures background elements')`<br>`it('[REQ-302/AC-2] eliminates mobile-nav-height offset from backdrop padding-bottom at all breakpoints')`<br>`it('[REQ-302/AC-2] applies uniform 1rem padding-bottom in 768-1023px tablet range without nav margin')`<br>`it('[REQ-302/AC-5] incorporates env(safe-area-inset-bottom) with 0px fallback and avoids double padding')`<br>`it('[REQ-302/AC-6] desktop layout retains centered positioning, max-width caps, and standard padding')` |
| AppShell ナビ遮蔽 | `frontend/src/components/layout/__tests__/AppShell.test.tsx` | `it('[REQ-302/AC-1] mobile navigation is not clickable or accessible when modal overlay is present')` |
| プリセット競合モーダル | `frontend/src/components/__tests__/PresetConflictModal.test.tsx` | `it('[REQ-302/AC-3] traps Tab focus, closes on Escape or backdrop click, and restores focus')` |
| モバイル画像シート (例外維持) | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `it('[REQ-302/AC-1] mobile image sheet and fullscreen viewer render with elevated modal z-index')`<br>`it('[REQ-302/AC-6] preserves fullscreen viewer zoom, aspect ratio, and wake lock exception without regression')` |
| Studio プロジェクト作成 | `frontend/src/pages/DatasetStudioPage/components/__tests__/CreateProjectModal.test.tsx` | `it('[REQ-302/AC-3] handles Escape key, backdrop click, and focus trapping correctly in Common Modal')` |
| Studio ノード再割当 | `frontend/src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx` | `it('[REQ-302/AC-5] internal body scrolls correctly and actions remain reachable in constrained viewport')` |
| Studio 評価セル詳細 | `frontend/src/pages/DatasetStudioPage/__tests__/BenchmarkGrid.test.tsx` | `it('[REQ-302/AC-1] renders cell modal in common modal layer with safe-area max-height')` |
| History 一括削除確認 | `frontend/src/pages/__tests__/HistoryPage.test.tsx` | `it('[REQ-302/AC-4] bulk delete confirm modal opens exclusively and closes cleanly without double-stack leaks')` |
| 履歴プレビュー | `frontend/src/components/__tests__/HistoryModalPreview.test.tsx` | `it('[REQ-302/AC-2] flex-col preview backdrop does not retain obsolete nav avoidance margin in tablet width')` |
| ネスト例外保護 | `frontend/src/components/__tests__/WorkflowNodePicker.test.tsx` | `it('[REQ-302/AC-4] preserves nested exception: Escape closes picker only and does not bubble to outer modal')` |

---

## 4. 受入基準 (AC) マッピングと階層別テストシナリオ (Red Team含む)

### 4.1 受入基準 (AC) とテストケース・メタデータマッピング
| AC番号 | 検証観点 (Given-When-Then) | レイヤー | 安定ランナーID / ケース名 |
|---|---|---|---|
| **AC-1** | 対象オーバーレイが前面化され、ナビ領域からのタップ抜け・画面遷移が遮断されること | Integration / E2E | `[REQ-302/AC-1] modal backdrop renders with z-[var(--z-modal)] and obscures background elements`<br>`[REQ-302/AC-1] mobile navigation is not clickable or accessible when modal overlay is present` |
| **AC-2** | 375/767px mobile、768〜1023px tablet、desktopで不要なナビ回避余白がなく、safe-areaとアクション到達性が維持されること | Unit / Integration | `[REQ-302/AC-2] eliminates mobile-nav-height offset from backdrop padding-bottom at all breakpoints`<br>`[REQ-302/AC-2] applies uniform 1rem padding-bottom in 768-1023px tablet range without nav margin`<br>`[REQ-302/AC-2] flex-col preview backdrop does not retain obsolete nav avoidance margin in tablet width` |
| **AC-3** | Tab/Shift+Tabで背面ナビへフォーカスが漏れず、Escape・backdrop・閉じるで正常復帰すること | Integration | `[REQ-302/AC-3] traps Tab focus, closes on Escape or backdrop click, and restores focus`<br>`[REQ-302/AC-3] handles Escape key, backdrop click, and focus trapping correctly in Common Modal` |
| **AC-4** | モーダル切替は排他を維持し、SPEC_COMMON §1-4 の WorkflowNodePicker 例外のみがEscape単独制御を維持すること | Integration | `[REQ-302/AC-4] preserves nested exception: Escape closes picker only and does not bubble to outer modal`<br>`[REQ-302/AC-4] bulk delete confirm modal opens exclusively and closes cleanly without double-stack leaks` |
| **AC-5** | safe-areaおよびソフトキーボード表示時（縦幅縮小時）に入力と確定/取消へスクロール到達できること | Unit / Integration | `[REQ-302/AC-5] incorporates env(safe-area-inset-bottom) with 0px fallback and avoids double padding`<br>`[REQ-302/AC-5] internal body scrolls correctly and actions remain reachable in constrained viewport` |
| **AC-6** | PCレイアウト、画像確認シート（MobileImageSheet）、全画面ビューア、HistoryModalPreviewの既存機能が非回帰であること | Integration | `[REQ-302/AC-6] desktop layout retains centered positioning, max-width caps, and standard padding`<br>`[REQ-302/AC-6] preserves fullscreen viewer zoom, aspect ratio, and wake lock exception without regression` |

### 4.2 Tier 3: Red Teaming & 境界値・異常系 (Gate 3 Baseline)
1. **RT-1: ゴーストクリック・高速連続タップ遮断**:
   - **テストケース**: `[RedTeam] RT-1: rapid sequential clicks on bottom nav are fully trapped by modal backdrop`
   - **手順**: モーダル展開直後、ボトムナビの5つのタブ座標に対して 10ms 間隔で連続してタップイベントをディスパッチ。
   - **期待結果**: ボトムナビゲーションへの `pointerdown` / `click` 伝播がゼロであり、アクティブルートが変更されないこと。
2. **RT-2: 多重 Escape キー押下の伝播耐性**:
   - **テストケース**: `[RedTeam] RT-2: rapid double escape invokes close handler exactly once without uncaught exceptions`
   - **手順**: モーダル展開中に Escape キーを連続して 2 回素早く発火。
   - **期待結果**: モーダルが正常に 1 回だけ `onClose` を呼び出し、エラーや多重アンマウント例外が発生しないこと。
3. **RT-3: セーフエリア極端値注入耐性**:
   - **テストケース**: `[RedTeam] RT-3: extreme safe area insets fallback safely to minimum padding`
   - **手順**: `env(safe-area-inset-bottom)` に 0px, 44px, 100px 相当のスタイルおよび未定義（フォールバック）を注入。
   - **期待結果**: `calc(1rem + env(safe-area-inset-bottom, 0px))` が破綻せず、最低 1rem の余白が常に維持され、ボタンが画面外へはみ出さないこと。

---

## 5. リスク評価と強制全件フォールバック基準 (Risk Assessment & Fallback Triggers)

### 5.1 リスク分類
- **リスク度**: **High Risk (高リスク)**
- **判定理由**:
  - 本改修は全画面に影響を及ぼすグローバル基底CSS（`frontend/src/index.css` の `.modal-backdrop`）および複数のコア画面モーダル（Generate, Studio, History）にまたがる共通レイヤー改修である。
  - レスポンシブ境界（768〜1023px）の余白変更を伴うため、未検知のレイアウト崩れリスクが存在する。

### 5.2 強制全件フォールバックトリガー (Mandatory Full-Suite Fallback Triggers)
以下のいずれか1つでも該当した場合（OR条件）、スコープ限定検証は即時取り消され、Gate 2においてフルテストスイート（`npm test` 全件実行）の再実行が義務付けられる：
1. **高リスク領域への波及**: `frontend/src/index.css` の変更により、モーダル以外のコンポーネントのスタイルに予期せぬ回帰が発生した場合。
2. **テスト収集の不整合**: テスト件数の減少、予期せぬテストのskip、または空のテストコレクションが検知された場合。
3. **セマンティック/モック欠陥**: テストを通過させるための内部ロジックモンキーパッチや循環アサーションが発見された場合。
4. **型エラーの発生**: Gate 1（`npm run typecheck`）で1件でも型エラーが報告された場合。
5. **原因不明のテスト失敗・フレーキーテスト**: 環境依存やタイミング起因の不安定なテスト結果が検出された場合。



