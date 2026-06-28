# 設計書 - REQ-093: TagChipEditorドラッグ＆ドロップ並び替えテストの追加

## 1. 目的と概要
`TagChipEditor` コンポーネントは、プロンプト編集時などにタグをチップ形式で管理・表示し、ドラッグ＆ドロップによる並び替え機能などを提供しています。
本設計では、未テストであった `@dnd-kit` を用いたドラッグ＆ドロップによるチップ並び替え動作のテストを追加し、状態管理履歴（Undo/Redo）との連携の安定性を検証します。
また、衝突耐性とテスト時の再現性を高めるため、非決定論的な `Math.random()` による ID 生成処理を決定論的なインクリメンタル ID 生成方式へとリファクタリングし、コンポーネントアンマウント時にカスタムイベントリスナーが正常にクリーンアップされることを検証するテストケースを追加します。

## 2. 変更・設計内容

### 2.1 ID 生成方式の改善 (AC-3)
現在、`TagChipEditor/index.tsx` 内で `Math.random().toString(36).substring(2, 9)` を用いて新しいタグチップの ID をその場で生成しています。
この非決定論的な ID 生成を、インクリメンタルカウンターやタイムスタンプを組み合わせた衝突耐性のある決定論的生成方式に変更します。
また、テスト時には完全に予測可能（決定論的）なID（例: `chip-1`, `chip-2`）を生成可能にするため、テストモード用スイッチを設けます。

- **新規ファイル**: [idGenerator.ts](../../frontend/src/components/TagChipEditor/idGenerator.ts)
- **API**:
  - `generateChipId(prefix?: string): string`
  - `setDeterministicMode(enabled: boolean): void`
- **適用対象**:
  - `TagChipEditor/index.tsx` 内の `Math.random()` 呼び出し箇所（計3箇所）を `generateChipId()` に置換。

### 2.2 ドラッグ＆ドロップ（DND）のテスト設計 (AC-1)
JSDOM 環境における `@dnd-kit` のドラッグ＆ドロップテストは、PointerEvent のシミュレーションが不安定になりやすいため、`@dnd-kit/core` の `DndContext` をテスト用にモックするアプローチを採用します。

- **モック設計**:
  - `DndContext` のレンダリング時に、props として渡された `onDragEnd` ハンドラをテスト側から参照可能なグローバル変数（またはテストスコープ変数）に退避する。
  - テスト内でこの `onDragEnd` ハンドラを明示的に呼び出し、ドラッグ終了イベントを発生させる。
- **検証項目**:
  - 並び替えイベント発火後、チップの並び順が正しく更新され、`onChange` コールバックに期待される並び順の文字列が渡されること。

### 2.3 Undo/Redo の連携検証テスト設計 (AC-2)
ドラッグ＆ドロップによる順序の変更操作が正常に履歴スタックに積まれ、Undo/Redo によって順序が復元できることを検証します。
- **検証手順**:
  1. `initialValue="apple, banana"` でエディタを表示。
  2. DNDイベントをシミュレートして順序を `banana, apple` に並び替える。
  3. `onChange` が `banana, apple` で呼ばれることを確認。
  4. Container 要素上で `Ctrl+Z` キーイベント（Undo）を発生させる。
  5. `onChange` が `apple, banana` で呼ばれ、表示順が元に戻ることを確認。
  6. `Ctrl+Y` キーイベント（Redo）を発生させる。
  7. `onChange` が再び `banana, apple` で呼ばれることを確認。

### 2.4 アンマウント時のリスナー解除のテスト設計 (AC-4)
コンポーネントのアンマウント時に、グローバルカスタムイベント（`tag-chip-editor:disable-tag`, `tag-chip-editor:add-tag`）のリスナーが正常に解除され、メモリリークや無駄なイベント処理が発生しないことを検証します。
- **検証項目**:
  - `vi.spyOn(window, 'removeEventListener')` を用いて、`unmount` 時に対応するイベント名とリスナー関数が指定されて呼び出されていることを検証する。
  - `unmount` 実行後に `window.dispatchEvent` でカスタムイベントを発火させても、`onChange` などのコールバックが呼び出されないことを検証する。
