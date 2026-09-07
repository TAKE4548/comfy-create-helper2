# インシデントレポート: 画像プレビュー表示時にReactフックルール違反により画面がクラッシュする不具合

## 1. 事象概要 (Overview)

ユーザーより以下の事象が報告された。
- 16:9をはじめとするアスペクト比で画像を生成後、生成画像のプレビューを開こうとするとエラーが発生する。
- 複数のアスペクト比で同様に発生するため、アスペクト比固有の問題ではなくプレビュー機能そのものの不具合であることが疑われる。

調査の結果、生成画面等で画像をクリックして画像プレビューモーダル（`HistoryModalPreview`）を開く際に、Reactの「フックのルール（Rules of Hooks）」違反が発生し、`GlobalErrorBoundary` が発火して画面全体がクラッシュ（「システムエラーが発生しました」画面に遷移）していることが判明した。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 再現手順:
1. 生成画面（`GeneratePage`）を開く。
2. 任意のアスペクト比（16:9, 1:1, 3:4 等）で画像を生成する（または表示中の画像を選択する）。
3. メインプレビュー領域の画像をクリックして拡大プレビューモーダルを開く。

### 観測結果:
1. **画面クラッシュ**:
   - モーダルが開かず、画面全体が `GlobalErrorBoundary` のエラー表示（「システムエラーが発生しました / Rendered more hooks than during the previous render.」）に置き換わる。
2. **ログ証跡 (`logs/app.jsonl`)**:
   - `L581`: `[FE] window.onerror: Rendered more hooks than during the previous render.`
   - `L583`: `[FE] GlobalErrorBoundary: Rendered more hooks than during the previous render.`
   - `L602`: `[FE] window.onerror: Rendered more hooks than during the previous render.`
   - `L604`: `[FE] GlobalErrorBoundary: Rendered more hooks than during the previous render.`
3. **スタックトレース**:
   ```
   Error: Rendered more hooks than during the previous render.
       at updateWorkInProgressHook
       at updateCallback
       at Object.useCallback
       at useCallback
       at HistoryModalPreview (src/components/HistoryModalPreview.tsx:279:25)
   ```

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/components/HistoryModalPreview.tsx` | L303 | `if (!isOpen || images.length === 0) return null`（条件付き早期リターン） |
| 2 | `frontend/src/components/HistoryModalPreview.tsx` | L331 | `const getParamValue = useCallback(...)`（早期リターンより後に配置されたReact Hook） |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 発生メカニズム:
1. **React Hooks の実行順序制約（Rules of Hooks）**:
   - Reactはコンポーネント内のフック呼び出し順序と総数が毎レンダリングで不変であることを前提としてステートを管理している。そのため、条件分岐や早期リターンの後にフックを呼び出すことは厳禁とされている。
2. **モーダル非表示時 (`isOpen === false`) の動作**:
   - `GeneratePage` の初期描画時、`isModalPreviewOpen` は `false` であるため、`HistoryModalPreview` 内では L303 の `if (!isOpen || images.length === 0) return null` が成立し、コンポーネントは途中で早期リターンされる。
   - この時点で実行されるフック数は先頭から数えて **26個**（`useState`, `useRef`, `useCallback`, `useEffect`, `useQuery`, `useMemo` 等）。
3. **モーダル表示時 (`isOpen === true`) の動作**:
   - ユーザーが画像をクリックすると `isModalPreviewOpen` が `true` に更新され、再レンダリングが発生する。
   - `isOpen === true` であるため L303 の早期リターンを通過し、その直後（L331）にある `const getParamValue = useCallback(...)`（**27個目のフック**）が呼び出される。
4. **不具合の発現**:
   - React内部の `updateWorkInProgressHook` は、前回のレンダリング（26個）に対して今回のレンダリングで余分なフック（27個目）が呼び出されたことを検知し、`Rendered more hooks than during the previous render.` 例外を送出する。
   - この例外が `GlobalErrorBoundary` によって捕捉され、画面全体がクラッシュする。
   - 画像のアスペクト比設定とは無関係に、プレビューを開く操作（`isOpen: false -> true`）を行った時点で 100% 確実に発現する。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**:
  * **Type A (Implementation Bug)**:
    - コンポーネント内の条件付き早期リターン（`return null`）以降に `useCallback` フックが配置されているという、Reactの基本規約に違反した実装上の不具合。

---

## 6. バックログ登録とルーティング提案 (Backlog Registration & Routing)

- **推奨対応**: 
  - 本事象は実装バグ（Type A）であり、原因および該当箇所が完全に特定されているため、直ちに `/dev-design` へ進み、タスクカードを作成して修正を行うことを提案します。
- **次のワークフロー**: `/dev-design`

---

**ユーザー確認事項 (Approval Gate)**:
上記インシデントレポートの内容で合意いただける場合、PBIとしてバックログに登録し、`/dev-design` に進みますか？ (YES / NO)
