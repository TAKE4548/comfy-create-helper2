# REQ-408 実行可能テスト計画: モバイル: ボトムシートのスワイプダウンによる閉じるジェスチャー操作

## 1. テスト階層アーキテクチャ (Tier Hierarchy)

本テスト計画は、Antigravity SDD 3-Gate Baseline 検証に準拠し、以下の4層階層構造で構成される。全テストは Zero-GPU（CPU/RAMのみ）で実行され、GPUリソースを一切占有しない。

| 実行Tier | レイヤー区分 | 検証スコープと責務 | 想定実行時間 |
|---|---|---|---|
| **Tier 1** | 単体・静的型検査 (Unit & Static) | `Modal.tsx` のTypeScript型定義検査、プロパティシグネチャ、スワイプ閾値・クランプ計算の単体検証 | ~3秒 |
| **Tier 2** | コンポーネント結合 (Integration) | モバイル画面幅でのタッチジェスチャー追従、スクロール位置調停、閾値超過でのonClose発火、閾値未満のスナップ復帰 | ~5秒 |
| **Tier 3** | デスクトップ非破壊・E2E (Preservation & E2E) | デスクトップ画面幅（>= 768px）におけるスワイプ無効化、中央モーダル配置・既存閉じる導線の非破壊確認 | ~10秒 |
| **Scenario** | 境界値・Red Team (Boundary & Red Team) | touchCancel割り込み復帰、上方向ドラッグの0クランプ、disableSwipeToCloseによるオプトアウト保護 | ~4秒 |

---

## 2. 受入基準 (AC) とテストケース・安定ランナーIDマッピング

各受入基準および境界検証ケースは、既存のコロケーションテスト `frontend/src/components/common/__tests__/Modal.test.tsx` に追記され、安定したケース名タグ `[REQ-408/AC-n]` および `[REQ-408/RT-n]` を付与して局所実行可能とする（[W-DD-PLACE] 準拠）。

| 受入基準 | 安定ランナーID / テストケース名 | 検証Tier | 検証コマンド |
|---|---|---|---|
| **AC-1** | `[REQ-408/AC-1] closes bottom sheet and calls onClose when dragged down beyond threshold on mobile` | Tier 2 (Integration) | `cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408/AC-1"` |
| **AC-2** | `[REQ-408/AC-2] snaps back to original position without calling onClose when dragged below threshold` | Tier 2 (Integration) | `cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408/AC-2"` |
| **AC-3** | `[REQ-408/AC-3] prioritizes content scrolling and suppresses swipe-down close when scrollTop > 0` | Tier 2 (Integration) | `cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408/AC-3"` |
| **AC-4** | `[REQ-408/AC-4] preserves backdrop click and explicit close actions without gesture on mobile` | Tier 2 (Integration) | `cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408/AC-4"` |
| **AC-5** | `[REQ-408/AC-5] disables swipe-down close on desktop viewports (>= 768px)` | Tier 3 (Preservation) | `cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408/AC-5"` |
| **RT-1** | `[REQ-408/RT-1] clamps negative deltaY to 0 when dragged upwards` | Scenario (Red Team) | `cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408/RT-1"` |
| **RT-2** | `[REQ-408/RT-2] safely resets position on touchCancel without triggering onClose` | Scenario (Red Team) | `cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408/RT-2"` |
| **RT-3** | `[REQ-408/RT-3] respects disableSwipeToClose prop even on mobile viewports` | Scenario (Red Team) | `cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408/RT-3"` |

---

## 3. テストシームマップとテスト配置計画 ([W-DD-SEAM], [W-DD-PLACE])

### 3.1 テストシームマップ (Seam Map)
- **結合対象 (Integrated / 本物のコード)**:
  - `Modal.tsx` コンポーネント本体
  - React 合成タッチイベントハンドラ (`onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel`)
  - DOM スクロールプロパティ (`scrollTop`)
- **切断対象 (Severed)**:
  - なし。本機能は純粋なフロントエンドUIインタラクションであり、ネットワークI/Oや永続化層は関与しない。
- **モックレベル (Mock Level)**:
  - jsdom 環境下での `window.innerWidth` 切り替え (`Object.defineProperty(window, 'innerWidth', ...)` または `window.innerWidth = 375 / 1024`)
  - タッチイベントのディスパッチ (`fireEvent.touchStart`, `fireEvent.touchMove`, `fireEvent.touchEnd`, `fireEvent.touchCancel`)
- **PBT (Property-Based Testing) 判断**:
  - 不要。座標閾値比較（`translateY >= 80`）およびフラグ状態遷移であり、パーサーや広範な数学的ドメインを含まないため。
- **障害注入 (Fault Injection)**:
  - `touchCancel` 発生時の中断テスト
  - `scrollTop > 0` のスクロール状態での下向きスワイプ遮断テスト

### 3.2 テスト配置計画 (Test Placement Plan [W-DD-PLACE])
- **対象既存テストファイル**: `frontend/src/components/common/__tests__/Modal.test.tsx`
- **規約準拠**:
  - チケット名を含んだテストファイル（`REQ-408.test.tsx` 等）の新設は厳格に禁止（MUST [REQ-356/AC-1]）。
  - 既存の30件のテスト群の末尾に、新しい describe ブロック `describe('REQ-408: Mobile bottom sheet swipe-down to close gesture', () => { ... })` を追加して配置する。

---

## 4. 自動テスト Baseline 検証 (3-Gate Architecture)

### Gate 1: 静的型チェック & 高速単体 (Typecheck Baseline)
- **コマンド**:
  ```bash
  cd frontend; npm run typecheck
  ```
- **期待値**: エラー 0 件、Exit code 0。`ModalProps` に追加された `disableSwipeToClose?: boolean` が正しく型付けされていること。

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **局所検証コマンド (TDD)**:
  ```bash
  cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx -t "REQ-408"
  ```
- **サブシステム全体検証コマンド**:
  ```bash
  cd frontend; npx vitest run src/components/common/__tests__/Modal.test.tsx
  ```
- **期待値**: 新規8件＋既存30件＝計38件すべて PASS、Exit code 0。

### Gate 3: 実ブラウザ・非破壊検証 (E2E & Preservation)
- **コマンド**:
  ```bash
  backend\.venv\Scripts\python scripts/run_e2e.py e2e/presetManagementModal.spec.ts
  ```
- **期待値**: 既存のモーダル操作E2Eテストが退行なく成立すること。

---

## 5. リスク評価と強制フォールバック設計 (Risk Assessment & Fallback)

### 5.1 リスク分類
- **リスク評価**: `low`
  - 理由: 純粋なフロントエンドUIコンポーネント（`Modal.tsx`）のイベント追加であり、バックエンド、データベース、APIスキーマ、権限管理、認証などの高リスク領域に一切触れないため。

### 5.2 強制フルスイートフォールバック発動トリガー (Mandatory Full-Suite Fallback)
以下のいずれかの条件が検出された場合、局所テストによる完了判定を即座に破棄し、フルテストスイート（`npm test`）による検証を強制実行する：
1. `Modal.test.tsx` 内の既存30件のテストのうち、1件でも予期せぬ失敗・スキップが発生した場合。
2. 収集テスト件数の不整合（テストケース数が着手前30件＋新規8件＝38件とならない場合）。
3. 型検査（`npm run typecheck`）で `Modal.tsx` 以外のファイルに影響が出た場合。
4. デスクトップ表示（`window.innerWidth >= 768`）においてモーダルの既存レイアウトやクリック挙動が変化した場合。

---

## 6. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  ```bash
  python ${GLOBAL_HELPERS}\local_model_adapter.py --context-length 32768 qa-audit --audit-kind qa_evidence --audit-package <PKG_JSON> docs/design/REQ-408-test-plan.md
  ```
- **アンロード**:
  ```bash
  python ${GLOBAL_HELPERS}\local_model_adapter.py unload
  ```

