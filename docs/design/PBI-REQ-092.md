# 設計書 - REQ-092: useGeneratePageState.ts統合テストの追加

## 1. 目的と概要
`useGeneratePageState.ts` は、画像生成ページ（GeneratePage）の複雑な親状態（各種ダイアログの開閉状態、パラメータ初期化、スナップショット読み込み、複数選択モード、画像ナビゲーション、ZustandストアやReact QueryによるAPIフェッチ結果など）を統合して管理する中心的カスタムフックです。
このフックに対するテストが現在存在しないため、React Testing Library を用いた統合テストを追加し、以下の仕様・機能連携が正常に行われることを検証します。
1. React Query (TanStack Query) および Zustand ストアが適切にモック・ラップされたテスト実行環境の構築 (AC-1)
2. ワークフロー変更に伴う初期パラメータ設定、スナップショット選択時のパラメータ・アセット（LoRA/TagSet）の状態伝播フロー (AC-2)
3. 複数選択モード (`useMultiSelect`) や画像ナビゲーション (`useImageNavigation`) との連携・動作検証 (AC-3)
4. 保存モーダルやワークフローアップロードモーダルなどの開閉・データ同期の検証 (AC-4)

## 2. 対象コンポーネントと設計

### 2.1 テスト対象
- **フックファイル**: `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts`
- **テストファイル**: `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`

### 2.2 テスト環境とモック設計
統合テストを安定して実行するため、以下のモックおよびプロバイダーのセットアップを行います。

#### A. React Query / QueryClient のセットアップ
`renderHook` 実行時に `QueryClientProvider` でラップし、各テストケース間でクエリキャッシュが干渉しないようクリーンな `QueryClient` インスタンスを毎回生成します。

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
```

#### B. Zustand ストア (`useGenerationStore`) のモック/制御
`useGenerationStore` に依存しているため、モックを作成するか、テスト毎に状態をリセットできる構造にします。
`vitest` の `vi.mock` を用いて、テスト内でストアの状態を容易に制御・検証できるようにモック化します。

```typescript
vi.mock('../../../store/useGenerationStore', () => {
  const mockStore = {
    clientId: 'test-client-id',
    selectedWorkflowId: null,
    setSelectedWorkflowId: vi.fn(),
    paramValues: {},
    setParamValues: vi.fn(),
    batchSize: 1,
    setBatchSize: vi.fn(),
    seedMode: 'random',
    setSeedMode: vi.fn(),
    seed: 42,
    setSeed: vi.fn(),
    batchImages: [],
    selectedImg: null,
    setSelectedImg: vi.fn(),
    comfyHistoryImages: [],
    appliedAssets: {},
    addAppliedAsset: vi.fn(),
    removeAppliedAsset: vi.fn(),
    toggleAppliedAsset: vi.fn(),
    setAppliedAssets: vi.fn(),
    comfyUrl: 'http://localhost:8188',
    setComfyUrl: vi.fn(),
    sets: [],
    updateActiveSet: vi.fn(),
    isConnected: true,
    isGenerating: false,
    progress: null,
    previewImage: null,
    activeClientId: 'test-client-id',
    filterOwnSession: false,
    setFilterOwnSession: vi.fn(),
    activeBatch: null,
    activeSetId: null,
    setActiveSetId: vi.fn(),
    setSets: vi.fn(),
    queueRunning: [],
    queuePending: [],
  }
  return {
    useGenerationStore: () => mockStore,
  }
})
```

#### C. API クライアント (`../../../api/client`) のモック
APIリクエストを行う `workflowsApi`, `snapshotsApi`, `mappingMastersApi`, `lorasApi`, `tagSetsApi`, `workflowPresetsApi` のメソッド群を `vi.mock` でスタブ化します。

```typescript
vi.mock('../../../api/client', () => ({
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    copy: vi.fn(),
  },
  snapshotsApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
  mappingMastersApi: {
    list: vi.fn(),
  },
  lorasApi: {
    list: vi.fn(),
  },
  tagSetsApi: {
    list: vi.fn(),
  },
  workflowPresetsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))
```

## 3. テストケース構成

### 3.1 初期状態の検証 (AC-1)
- **検証項目**: 各種ダイアログ（rescanOpen, isSettingsOpen, isSaveModalOpen, uploadModalOpen）が初期状態で `false` であること、クエリ呼び出しが期待通りに開始されること。

### 3.2 状態伝播フローの検証 (AC-2)
- **検証項目**: 
  - `handleLoadSnapshot(id)` が呼び出された際、`snapshotsApi.get` から取得したパラメータおよび適用アセット（LoRA/TagSet）が正しくパースされ、Zustandストアへ `setParamValues` / `setAppliedAssets` を介して設定されること。
  - ワークフローの切り替え時に `selectedWorkflowId` が更新されること。

### 3.3 複数選択モードと画像ナビゲーションの検証 (AC-3)
- **検証項目**:
  - `isMultiSelectMode`, `selectedIds` などの複数選択状態が `useMultiSelect` の戻り値と正しく同期・連携していること。
  - 画像ナビゲーション `handlePrevImg`, `handleNextImg` が期待どおり呼び出し可能であること。

### 3.4 モーダルダイアログ開閉とデータ同期の検証 (AC-4)
- **検証項目**:
  - 各種モーダルのフラグ（`isSaveModalOpen`, `uploadModalOpen` 等）の状態変更メソッド（`setIsSaveModalOpen`, `setUploadModalOpen` 等）を呼び出した際、状態が正しく反映されること。
  - プリセット作成時に `createPresetMutation` がトリガーされ、正しいパラメータで `workflowPresetsApi.create` が呼び出されること。
