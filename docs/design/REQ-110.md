# Design Document: REQ-110 プロファイル選択状態の永続化と新規作成時の自動選択

## 1. 概要
本ドキュメントは、生成画面におけるプロファイル（別称：セット / プリセット / `WorkflowPreset`）の選択状態（アクティブタブ）がリロードやブラウザ再起動でリセットされずに保持される機能、および新規プロファイル作成時に新プロファイルを自動的に開いてアクティブ化する機能の設計を定義します。

## 2. 現状の課題と原因分析
1. **リロード時のアクティブプロファイル消失**:
   * 原因: `localStorage` に保存される `activeSetId` は常に文字列（`string`）型として格納されますが、データベース（FastAPI backend）からロードされる `WorkflowPreset` の `id` は数値（`number`）型です。
   * フロントエンドの `DesktopLayout.tsx` および `useGeneratePageState.ts` において、`s.id === activeSetId` のように厳密等価演算子（`===`）を用いて比較しているため、`2 === "2"` が `false` となり、アクティブなプロファイルが存在しないと判定されてしまいます。
   * その結果、フォールバック処理によって常に最初のプロファイル（`presets[0]`）がアクティブに切り替わってしまっています。
   * ※なお、`MobileLayout.tsx` では既に `String(s.id) === String(activeSetId)` による型安全な比較が実装されていますが、デスクトップ版の `DesktopLayout.tsx` では `===` による比較が行われています。
2. **新規作成時に自動で開かない**:
   * 原因: 新規プロファイル作成時、`createPresetMutation` の `onSuccess` で `setActiveSetId(newPreset.id)` は呼び出されていますが、そのプロファイルを表示用タブリストに追加する `openPreset(newPreset.id)` が呼び出されていないため、タブが明示的に開かれず、以前のタブがアクティブのままになってしまいます。

## 3. 設計方針と変更内容

### 3-1. ID比較時の型ミスマッチの解消 (AC-1, AC-2, AC-3)
型ミスマッチによるバグを解消するため、デスクトップレイアウトおよび状態同期ロジックにおいて、プロファイルIDの比較を文字列型に統一します。

* **[frontend/src/pages/GeneratePage/components/DesktopLayout.tsx](../../frontend/src/pages/GeneratePage/components/DesktopLayout.tsx)**:
  * アクティブセットの検索箇所を `String` キャストを伴う比較に修正します。
    ```diff
    - const activeSet = sets.find((s) => s.id === activeSetId)
    + const activeSet = sets.find((s) => String(s.id) === String(activeSetId))
    ```
  * タブバー의 レンダリングにおけるアクティブ判定を修正します。
    ```diff
    - s.id === activeSetId
    + String(s.id) === String(activeSetId)
    ```

* **[frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts](../../frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts)**:
  * プリセットと Zustand ストアの同期処理（`useEffect`）において、`activeSetId` の有効判定（`isInvalidActive`）に `String` 比較を適用します。
    ```diff
    - const isInvalidActive = activeSetId === null || !safeOpenPresetIds.includes(activeSetId)
    + const isInvalidActive = activeSetId === null || !safeOpenPresetIds.map(String).includes(String(activeSetId))
    ```
  * 同期処理内のアクティブプリセット取得部分を修正します。
    ```diff
    - const activePreset = presets?.find(p => p.id === activeSetId)
    + const activePreset = presets?.find(p => String(p.id) === String(activeSetId))
    ```

### 3-2. 新規作成プロファイルの自動オープンとアクティブ化 (AC-4, AC-5)
新規プロファイル作成時に、自動的にタブを開いてアクティブにする処理を実装します。

* **[frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts](../../frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts)**:
  * `createPresetMutation` の `onSuccess` ハンドラにおいて、`setActiveSetId` の呼び出しに加え、`openPreset` アクションを呼び出して `openPresetIds`（表示タブ）に新規IDを追加します。
    ```diff
    onSuccess: (newPreset) => {
      qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
      setNewPresetName('')
      if (newPreset?.id) {
        setActiveSetId(newPreset.id)
    +   openPreset?.(newPreset.id)
      }
    }
    ```

## 4. UI/UXへの影響
* リロードや再起動を行っても、直前まで作業していたプロファイルタブが選択された状態で復帰するため、意図しない他プロファイルの上書きミス（手戻り）が完全に防止されます。
* 新規プロファイル作成時に即座にそのプロファイルがタブとして開き、かつアクティブ状態になるため、作成直後の編集がスムーズに行えるようになります。

## 5. 開発における注意点
* `localStorage` 内の `activeSetId` および `openPresetIds` は文字列として保存されるため、常に `String` にキャストした上での比較を徹底します。
