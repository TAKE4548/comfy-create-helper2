# REQ-086: タッチデバイス操作時のスクロール阻害問題の解消 設計仕様書

## 1. 目的と概要
モバイル・タッチデバイスにおいて、アルバムページや履歴ページ一覧の画像領域をスワイプ（スクロール）しようとした際、スクロールが阻害されたり、スワイプ終了時に画像のタップイベント（詳細プレビューモーダル表示など）が誤動作する問題を解消します。
スクロールとタップ・ロングプレスの挙動を適切に分離し、滑らかなユーザーエクスペリエンスを提供します。

## 2. 変更内容

### 2.1 SortableItem の `touchAction` 動的制御
- **ファイル**: [HistoryPage.tsx](file:///frontend/src/pages/HistoryPage.tsx)
- **内容**:
  - `SortableItem` コンポーネント内の `touchAction: 'none'` は、ドラッグ＆ドロップ（DND）の動作のために設定されていますが、常時 `none` に設定されているため画像領域でのタッチスクロールが完全にブロックされています。
  - ドラッグ中 (`isDragging` が true) の場合のみ `touchAction: 'none'` とし、通常時（非ドラッグ時）は `touchAction: 'pan-y'`（または `auto`）に変更して、ブラウザの垂直スクロールを許可します。
  ```typescript
  const style = {
    // ...既存スタイル
    touchAction: isDragging ? 'none' : 'pan-y'
  }
  ```

### 2.2 `useMultiSelect` のロングプレス判定とタッチイベント制御の改善
- **ファイル**: [useMultiSelect.ts](file:///frontend/src/hooks/useMultiSelect.ts)
- **内容**:
  - `onTouchStart` で登録された `touchmove` や `touchend` などのグローバルイベントリスナーに加え、ブラウザがスクロール開始を検知した際に発火する `touchcancel` イベントを監視するようにします。
  - `touchcancel` が発生した場合は、ロングプレスのタイマーを即座に解除 (`globalClear`) し、スクロール操作中（またはスクロールによってタッチがキャンセルされた後）に誤って複数選択モードに移行するのを防止します。
  - タッチ開始時に `touchcancel` イベントのリスナーを追加し、クリーンアップ時に解除します。
  ```typescript
  document.addEventListener('touchcancel', globalClear);
  ```

## 3. 影響範囲と移行計画
- **データベース変更**: なし
- **APIへの影響**: なし
- **影響を受ける画面**:
  - 履歴ページ (`HistoryPage`)
  - その他 `useMultiSelect` が使われている LoRA管理ページ (`LoRAsPage`)、タグ管理ページ (`TagsPage`) など。

## 4. トレードオフとリスク (Trade-off Disclosure)
- **リスク**: `touchAction: 'pan-y'` を指定することで、ドラッグ開始時に上下のスワイプでわずかに画面がブレる（スクロールと判定される）可能性があります。
- **対策**: `@dnd-kit/core` の `TouchSensor` は `delay`（デフォルト 500ms）と `tolerance: 5px` のアクティベーション制約を適用しているため、500ms以上の長押しを行わない限りドラッグ状態へ移行せず、その間に5px以上動いた場合はブラウザのスクロールとして処理され、ドラッグはキャンセルされます。これにより直感的な操作が維持されます。
