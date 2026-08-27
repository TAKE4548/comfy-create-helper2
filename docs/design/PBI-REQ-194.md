# REQ-194: モバイル（Android/タッチ操作）での長押し複数選択の操作性改善・不具合修正 詳細設計

## 1. 概要 (Overview)
スマートフォン（主に Android 端末のブラウザ）において、生成履歴画面で画像をロングタップしても複数選択モードに遷移しない不具合を解消する。
指を置いた瞬間の微小ブレ（接触重心変化）によって長押しタイマーが即座にキャンセルされる問題の解消、合成クリックイベントとの衝突防止、および画像カードに対するネイティブコンテキストメニュー・ジェスチャ干渉の抑制を行う。

---

## 2. 影響範囲 (Impact Analysis)

### 2.1 影響ファイル
1. `frontend/src/hooks/useMultiSelect.ts`:
   - `globalMove` における移動キャンセル判定閾値をモバイルタッチ操作に適した値（15px）に拡張。
   - 長押し完了直後に発生する合成 `click` イベントによる即時トグル（選択解除）を防止するガードフラグ（`justLongPressedRef`）を導入。
   - `getLongPressHandlers` の返却値に `onContextMenu: (e) => e.preventDefault()` を追加。
2. `frontend/src/pages/HistoryPage.tsx`:
   - スナップショットカード要素に `onContextMenu` 抑制および `WebkitTouchCallout: none`, `userSelect: none`, `touchAction: pan-y` を適用。
   - スナップショット画像要素（`<img>`）に `pointer-events-none` クラスを追加。
3. `frontend/src/hooks/__tests__/useMultiSelect.test.ts`:
   - タッチ微小移動（10px等）で長押しがキャンセルされないことの検証テスト。
   - タッチ移動超過（15px以上）で長押しが正しくキャンセルされることの検証テスト。
   - 長押し成立直後のクリックイベントで選択が解除されないことの検証テスト。

---

## 3. 実装詳細仕様 (Detailed Specifications)

### 3.1 `frontend/src/hooks/useMultiSelect.ts`
- **移動キャンセル閾値の見直し**:
  ```typescript
  const MOVE_THRESHOLD = 'touches' in e ? 15 : 8;
  if (distance >= MOVE_THRESHOLD) {
    isDraggingRef.current = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // ...
  }
  ```
- **長押し成立後のクリック競合防止**:
  ```typescript
  const justLongPressedRef = useRef(false);
  
  // タイマー満了時:
  timer = setTimeout(() => {
    justLongPressedRef.current = true;
    enterMultiSelectMode(id);
    globalClear();
    setTimeout(() => {
      justLongPressedRef.current = false;
    }, 400);
  }, delay);
  
  // handleItemClick 冒頭:
  if (justLongPressedRef.current) {
    return;
  }
  ```
- **`getLongPressHandlers` の拡張**:
  ```typescript
  return {
    onMouseDown: start,
    onMouseUp: globalClear,
    onMouseLeave: globalClear,
    onTouchStart: start,
    onTouchEnd: globalClear,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  ```

### 3.2 `frontend/src/pages/HistoryPage.tsx`
- **スナップショットカードのタッチ制御**:
  ```tsx
  <div
    key={snap.id}
    id={`snap-card-${snap.id}`}
    onMouseDown={longPressHandlers.onMouseDown}
    onMouseUp={longPressHandlers.onMouseUp}
    onMouseLeave={longPressHandlers.onMouseLeave}
    onTouchStart={longPressHandlers.onTouchStart}
    onTouchEnd={longPressHandlers.onTouchEnd}
    onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
    style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none', userSelect: 'none' }}
    className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer select-none ...`}
  >
    <div className="aspect-square bg-surface-2">
      {snap.image_path || snap.thumbnail_path ? (
        <img
          src={snap.thumbnail_path || snap.image_path!}
          alt={`Snapshot ${snap.id}`}
          loading="lazy"
          className="w-full h-full object-cover pointer-events-none"
        />
      ) : ( ... )}
    </div>
  </div>
  ```

---

## 4. Acceptance Criteria (AC)
- [ ] AC-1: モバイル端末（Android / タッチスクリーン）で画像カードを長押しした際、指の微細なブレがあっても判定時間経過後に安定して複数選択モードへ遷移すること。
- [ ] AC-2: 長押し判定中の移動許容閾値（スロップ値）がモバイルタッチ操作に適した値（15px）に調整され、不要な即時キャンセルが発生しないこと。
- [ ] AC-3: 生成履歴画面（HistoryPage）のスナップショット画像カードにおいて、ブラウザネイティブの画像長押しコンテキストメニューや不要なドラッグ・選択挙動が抑制されていること。
- [ ] AC-4: 長押し成立後に指を離した際、クリックイベントとの競合によって選択が意図せず解除・誤動作しないこと。
- [ ] AC-5: 既存のデスクトップ操作（Ctrl/Shift クリック、マウスでの長押し等）および設定画面の長押し時間変更機能が正常に動作すること。
