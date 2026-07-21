# インシデントレポート

**報告日**: 2026-07-21  
**報告者**: Incident Analyst  
**対象事象**: 生成画面のプロファイル/プリセットタブおよびプロンプトアコーディオンの展開状態がリロード時に保持されない事象  

---

## 1. 症状 (Symptoms)

| 項目 | 内容 |
|---|---|
| 報告内容 | 生成画面において、プロファイルタブ（Multi-Set / プリセットタブ）の選択状態（Currentなど）およびプロンプトカードの展開（アコーディオン）状態がリロード時に保持されない。 |
| 期待動作 | ページをリロードしても、直前まで選択していたCurrent/プロファイルタブがアクティブとして維持され、各プロンプトカードの展開・折りたたみ状態もそのまま維持されること。 |
| 実際の動作 | ページリロード時にプロファイルタブが先頭のタブにリセットされ、プロンプトカードの選択状態やアコーディオン展開状態も初期化・リセットされる。 |
| 影響範囲 | 生成画面（[DesktopLayout.tsx](../frontend/src/pages/GeneratePage/components/DesktopLayout.tsx), [MobileLayout.tsx](../frontend/src/pages/GeneratePage/components/MobileLayout.tsx)）のPC・モバイル両環境 |

---

## 2. 再現手順 (Reproduction Steps)

1. PCまたはモバイル環境で生成画面（`/generate` または `/mobile/generate`）を開く。
2. Multi-Set / プリセットタブで「Current」以外のプロファイルタブ（例: 「Set 2」など）を選択する。
3. モバイルの場合、アクティブなプロンプトタブ（例: Positive / Negative / キャラクター等）を切り替える。またはPC/モバイルでアコーディオンを折りたたみ/展開する。
4. ブラウザの更新ボタンでページをリロードする。
5. **結果**:
   - 選択していたプロファイルタブが維持されず、先頭のプロファイル（Set 1 / デフォルト）に戻る。
   - モバイルのアクティブプロンプトタブやPC/モバイルのアコーディオン展開状態が初期状態にリセットされる。

---

## 3. 根本原因分析 (Root Cause Analysis)

<root_cause_analysis>
### 分類: **Type A — 実装上のバグ（フロントエンド状態保持ロジックの不備）**

本不具合は、[useGeneratePageState.ts](../frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts) および [useGenerationStore.ts](../frontend/src/store/useGenerationStore.ts) における `activeSetId`（アクティブなプロファイルタブ）および `activePromptTab`（モバイルアクティブタブ）/ `collapsedRoles`（アコーディオン展開状態）の永続化・復元処理の不備に起因しています。

#### 原因1: プリセット取得時の `activeSetId` 自動リセット処理
- `useGeneratePageState.ts` の `useEffect`（`presets` 変更検知時）において、APIから `presets` が取得された際、`activeSetId` のバリデーション判定 (`isInvalidActive`) が行われます。
- 型の一致判定（文字列 `string` と数値 `number` の相互変換のズレなど）や `safeOpenPresetIds` との検証ロジックにより、`localStorage` から復元された直後の `activeSetId` が無効とみなされ、強制的に `safeOpenPresetIds[0]` または `presets[0].id` に上書き・リセットされていました。

#### 原因2: モバイルアクティブプロンプトタブ (`activePromptTab`) の強制初期化
- `useGeneratePageState.ts` 内の `useEffect` にて `workflow` 読み込み時に `setActivePromptTab(texts[0].role || '')` が常に実行されており、`localStorage` への保存およびリロード時の読み込みロジックが存在していませんでした。

#### 原因3: アコーディオン折りたたみ状態 (`collapsedRoles`) の初期ロード時の非同期同期漏れ
- `getIsRoleCollapsed` は `localStorage` を参照しますが、`useGeneratePageState.ts` の初期状態 (`collapsedRoles = {}`) でコンポーネントが初期化された際、`workflow` 取得後のレンダリングタイミングで `localStorage` の値とローカルステートの同期が完全に行われておらず、一部の操作で展開状態が意図せずデフォルトに戻ってしまう挙動が発生していました。
</root_cause_analysis>

---

## 4. 修正方針 (Recommended Fix Scope)

> [!IMPORTANT]
> 以下は調査に基づく修正方針の整理です。実際のコード修正は、本レポートについてユーザーの合意を得た後、`/dev-design` および `/dev-task` ワークフローにて実行します。

1. **`activeSetId` (プロファイルタブ) の永続化と型安全な復元**:
   - `useGenerationStore.ts` および `useGeneratePageState.ts` において、`localStorage` に保存された `activeSetId` を読み込む際、IDの型（数値/文字列）を統一して厳密に比較する。
   - `presets` 読み込み時に保存された `activeSetId` が存在していればそれを優先し、無意味な初期タブへのリセットを行わないように修正する。
2. **`activePromptTab` (モバイルプロンプトタブ) の `localStorage` 永続化**:
   - `activePromptTab` の変更時に `localStorage`（例: `prompt-surgeon-active-prompt-tab-${workflowId}`）へ保存し、`workflow` 読み込み時は `localStorage` に保存された値があればそれを復元し、無ければデフォルト `texts[0].role` を使用する。
3. **アコーディオン展開状態 (`collapsedRoles`) の確実な初期化と永続化**:
   - 各ロールごとの折りたたみ状態の保存・取得処理を整備し、リロード時にも `localStorage` から正確に展開状態を初期ロードする。

---

## 5. 次のアクション

この調査内容と修正方針（Type A インシデント）について問題ない場合、ユーザーの承認（YES / NO）を得て、タスク登録および `/dev-design` へ移行します。
