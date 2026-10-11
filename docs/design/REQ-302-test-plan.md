# REQ-302 実行可能テスト計画: モーダルのボトムナビゲーション前面オーバーレイ化

## 1. 自動テスト (CLI Baseline Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: エラー 0 件（Exit code 0）。CSS/Tailwind 型、React コンポーネント props、z-index 参照の型整合性。

### Gate 2: ユニット＆結合テスト (Unit / Component Suite Baseline)
- **コマンド**: `cd frontend; npx vitest run src/test/e2e_req302_mobile_modal_overlay.test.tsx src/components/common/__tests__/Modal.test.tsx`
- **期待値**: 全テスト PASS（Exit code 0）。
- **フルスイート回帰確認**: `cd frontend; npm test` で 122+ ファイル 1160+ テスト全 PASS。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: モバイルボトムナビ前面へのモーダルオーバーレイ検証 (AC-1, AC-3)
- **対象**: `AppShell` とモーダル（`Modal`, `PresetManagerPanel`, `HistoryModalPreview` 等）
- **操作**:
  1. ビューポートをモバイル幅（390px × 844px）に設定し、ボトムナビゲーションが表示された状態にする。
  2. 任意のモーダルを開く。
  3. モーダルのバックドロップが `fixed inset-0` で全画面を覆い、`z-index: 100`（`var(--z-modal)`）がボトムナビゲーションの `z-index: 40`（`var(--z-mobile-nav)`）よりも上位に配置されていることを確認。
  4. 画面最下部のボトムナビゲーションの配置領域をクリック/タップした際、ボトムナビの `<NavLink>` が反応せず、モーダルのバックドロップクリック（クローズ）またはダイアログ内操作としてハンドリングされることを検証。
  5. `Escape` キー押下時にモーダルが正しく閉じ、背面のボトムナビゲーションが復帰することを確認。

### シナリオ 2: 画面縦幅最大活用とボトムボタン視認・操作性検証 (AC-2)
- **対象**: 長大なコンテンツを持つモーダル（`BatchSpeechTransformModal`, `ParamTypeMasterModal`, `BaseImageSelectModal` 等）
- **操作**:
  1. モバイルビューポートで項目数の多いモーダルを開く。
  2. `.modal-backdrop` の `padding-bottom` が `--mobile-nav-height`（4rem / 64px）分差し引かれていないこと（計算値が `calc(1rem + env(safe-area-inset-bottom, 0px))` であること）を検証。
  3. モーダルのフッターにある「保存」「適用」「閉じる」ボタンがボトムメニューに被さることなく、画面下端近くまで広々と表示・スクロール可能であり、クリック/タップ可能であることを確認。

### シナリオ 3: ネストされた確認モーダルのスタッキング順序 (AC-4)
- **対象**: `GeneratePage`（プリセット一括削除確認）、`HistoryPage`（スナップショット一括削除確認）
- **操作**:
  1. 一次モーダル（プリセット管理等）を開く。
  2. その中から確認ダイアログ（`isBulkDeleteConfirmOpen` 等）を開く。
  3. 二次確認ダイアログの `z-index` が `110`（`var(--z-modal-nested)`）として一次モーダル（`100`）およびボトムナビ（`40`）よりも最前面に描画されることを確認。
  4. 一次モーダルやボトムナビの操作が遮断され、二次モーダルでの確定/キャンセル操作が完結できることを検証。

### シナリオ 4: セーフエリアクリアランスとフォールバック (AC-5)
- **対象**: `env(safe-area-inset-bottom)` 対応環境および未対応環境
- **操作**:
  1. `safe-area-inset-bottom` が 0px または未定義の場合、フォールバック値 `1rem` が適用され、ダイアログ下部に `1rem`（16px）の均等パディングが維持されることを確認。
  2. iOS ホームインジケーター等の環境（34px）をエミュレートした場合、`padding-bottom` が `calc(1rem + 34px)` となり、最下部ボタンがシステムジェスチャー領域と重ならないことを確認。

### シナリオ 5: デスクトップ環境の非回帰検証 (AC-6)
- **対象**: デスクトップ幅（1024px 以上、サイドバーナビゲーション表示）
- **操作**:
  1. 画面幅 1280px で各種モーダルを開く。
  2. モーダルのセンタリング表示、最大幅・高さ、`padding-bottom: 1rem;` が維持され、サイドバーとの重なりやレイアウト崩れが一切発生しないことを確認。

---

## 3. Red Teaming (境界値・異常系シナリオ)

### Red Team 1: 重複タップ・ゴーストクリック遮断 (Ghost Click & Event Propagation Leak)
- **手順**: モーダル展開直後、ボトムナビゲーションの各タブ位置（Generate, LoRAs, Tags, History, Settings）と全く同一のスクリーン座標（画面下部 Y: 100% 付近）に対して高速に連続タップ/クリックイベントをディスパッチする。
- **期待結果**:
  - イベントはモーダルのバックドロップ要素で完全にトラップされ、ボトムナビゲーション要素への `click` / `pointerdown` は伝播しない。
  - ルーティング遷移（URL の変化や画面遷移）が 1 回も発生しないこと。

### Red Team 2: 不正または極端なセーフエリア値の境界値テスト (Safe-Area Extreme Values)
- **手順**: `env(safe-area-inset-bottom)` に極端な値（0px, 120px、または CSS 未対応の空文字列）が渡された場合のレイアウト耐性を検証。
- **期待結果**:
  - CSS の `calc(1rem + env(safe-area-inset-bottom, 0px))` が NaN や invalid にならず、フォールバック構文により最低 1rem（16px）以上のパディングが保証され、ボタンが見切れたりスクロール不能に陥らないこと。

### Red Team 3: 二次モーダル展開中の背面一次モーダルへの Esc / バックドロップ操作漏れ
- **手順**: 一次モーダルを開いた状態で二次確認モーダルを展開し、Esc キーを押下、またはバックドロップをクリックする。
- **期待結果**:
  - 最前面の二次確認モーダルのみが閉じ、背面の一次モーダルは閉じずに保持されること（あるいは意図されたモーダルスタック順序で 1 段ずつクローズされること）。
  - ボトムナビゲーションが露出したり誤動作しないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **BA 監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py ba-audit` (Reasoning モデルによる論理・整合性監査)
- **VRAM 解放**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py unload` (推論完了後の即時 GPU メモリ全解放確認)

