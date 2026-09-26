# REQ-269 実行可能テスト計画: タグセット・LoRAのカテゴリセクション化とセクション内スコープ並び替え

## 1. 自動テスト (CLI Verification)

### Gate 1: 型検査 (Typecheck)
- **Frontend**:
  - **コマンド**: `cd frontend; npm run typecheck`
  - **対象**: `frontend/src/pages/TagsPage.tsx`, `frontend/src/pages/LoRAsPage.tsx`, `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/hooks/useAccordionSections.ts`
  - **期待値**: エラー 0 件（終了コード 0）。
- **Backend**:
  - **コマンド**: `mypy backend/app/routers/tag_sets.py backend/app/routers/loras.py backend/app/schemas/tag_set.py backend/app/schemas/lora.py`
  - **対象**: `backend/app/schemas/` および `backend/app/routers/`
  - **期待値**: エラー 0 件（終了コード 0）。

### Gate 2: 単体・回帰テスト (Unit & Regression Tests)
- **Frontend 単体テスト**:
  - **コマンド**: `cd frontend; npx.cmd vitest run src/pages/__tests__/TagsPage.test.tsx src/pages/__tests__/LoRAsPage.test.tsx`
  - **期待値**: 全テストケース PASS（終了コード 0）。
  - **カバー範囲**:
    1. カテゴリごとのアコーディオンセクション分割レンダリング（AC-1）
    2. セクションヘッダー表示（名前・件数・開閉トグル）およびクリックによる開閉（AC-2）
    3. `localStorage` への開閉状態保存と復元（AC-3）
    4. カテゴリ未割当カードの「未分類（その他）」セクション集約表示（AC-4）
    5. カテゴリ複数選択フィルタによるセクション表示・非表示（OR条件）（AC-5）
    6. カテゴリフィルタの「未分類」選択動作（AC-6）
    7. カテゴリフィルタ適用下でのD&D並び替え呼び出し（AC-7）
    8. セクション間ドラッグによるカテゴリ移動呼び出しとロールバック（AC-8）
    9. BaseModel/検索クエリ適用時のセクション構造維持（AC-9）
- **Backend 単体テスト**:
  - **コマンド**: `backend\.venv\Scripts\python -m pytest backend/tests/test_tag_sets_reorder.py backend/tests/test_loras_reorder.py`
  - **期待値**: 全テストケース PASS（終了コード 0）。
  - **カバー範囲**:
    1. `PUT /api/tag-sets/reorder` における `category_id` 指定時の局所更新
    2. `PUT /api/tag-sets/reorder` における `category_id: null`（未分類）の更新
    3. `PUT /api/tag-sets/reorder` における他カテゴリカードへの不干渉（`sort_order` 非破壊性）
    4. 移動カードに対する `category_id` 更新の即時反映
    5. レガシーリクエスト（`category_id` 未指定）の後方互換性維持（AC-10）
    6. `PUT /api/loras/reorder` における同等の全検証

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: カテゴリセクション初期表示と未分類集約
- **手順**:
  1. `TagsPage` または `LoRAsPage` をブラウザで開く。
  2. 登録済みカテゴリおよび未分類カードが存在する初期状態を確認。
- **期待値**:
  - 各カテゴリが独立したアコーディオンセクションとして縦スクロール表示される。
  - `category_id` が null のカードが最下部の「未分類（その他）」セクションに表示される。
  - 登録数0件のカテゴリはヘッダーに `(0件)` と表示され、空のドロップ領域が確保される。

### シナリオ 2: アコーディオン開閉トグルと localStorage 永続化
- **手順**:
  1. 特定カテゴリ（例: 「キャラクター」）のセクションヘッダーをクリックして折りたたむ。
  2. ブラウザをリロード（F5）または別画面（GeneratePageなど）へ遷移後に戻る。
- **期待値**:
  - リロード後も直前の折りたたみ状態が保持されていること。
  - 再度ヘッダークリックで展開されること。

### シナリオ 3: カテゴリ複数選択フィルタ（OR条件）によるセクション絞り込み
- **手順**:
  1. フィルタバーの「キャラクター」ボタンをクリック（選択状態）。
  2. 続けて「衣装」ボタンをクリック（複数選択状態）。
  3. 「未分類」ボタンをクリック。
- **期待値**:
  - 選択された「キャラクター」「衣装」「未分類」の3セクションのみが表示され、未選択セクションは非表示となる。
  - 「All」ボタンをクリックすると全選択が解除され、全セクションが再表示される。

### シナリオ 4: カテゴリ内 D&D 並び替えと他カテゴリ非干渉
- **手順**:
  1. 「キャラクター」セクション内のカードAをカードBの後ろへドラッグ＆ドロップ。
  2. バックエンドへ `{ category_id: 1, ordered_ids: [...] }` が送信されることを確認。
  3. 「衣装」セクションのカードの `sort_order` を確認。
- **期待値**:
  - 「キャラクター」セクション内のみ並び順が更新され、「衣装」セクションのカード順序には一切変動・衝突がないこと。

### シナリオ 5: セクション間 D&D によるカテゴリ移動
- **手順**:
  1. 「未分類」セクションのカードCをドラッグし、「キャラクター」セクションの任意位置へドロップ。
- **期待値**:
  - モーダル編集を経ずに、カードCの所属が「キャラクター」に即時変更される。
  - 「キャラクター」セクション内での挿入位置に応じた順序が反映される。

---

## 3. Red Teaming (境界値・異常系検証)

### Red-1: ネットワークエラー時の楽観的更新ロールバック
- **操作**:
  - API呼び出しを失敗（500 Internal Server Error またはオフライン）させる状態で、カードをセクション間またはセクション内でドラッグ＆ドロップする。
- **期待値**:
  - クライアント側で即時移動したカードが、API失敗検知と同時に元のカテゴリ・元の位置へ自動ロールバックすること。
  - ユーザーへ「並び替えの保存に失敗しました」等のエラー通知（alertまたはトースト）が表示されること。

### Red-2: 不正な ID や他カテゴリ ID の混入に対するバリデーション
- **操作**:
  - `PUT /api/tag-sets/reorder` に対し、存在しない ID（例: `[99999]`）や空配列 `[]` を送信する。
- **期待値**:
  - サーバーがクラッシュせず、正常に 204 No Content または適切なエラーを返却し、既存のDBデータに不整合が生じないこと。

### Red-3: 0件カテゴリへのドロップ受け入れと順序整合性
- **操作**:
  - 登録件数0件の空カテゴリセクションへ、他セクションからカードをドロップする。
- **期待値**:
  - ドロップが正常に認識され、カードの `category_id` が該当カテゴリIDに更新され、`sort_order` が 0 に設定されること。
  - セクションヘッダーの件数が `(0件)` から `(1件)` へ更新されること。

### Red-4: 検索クエリ適用時の D&D 誤操作防止
- **操作**:
  - 検索バーに「smile」と入力し、カードが部分的に絞り込まれている状態でドラッグ操作を試みる。
- **期待値**:
  - `isDndActive = false` となり、絞り込み中の不完全なリスト順序がDBへ書き込まれて全体順序を破壊する事故が防止されること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **BA論理監査**: `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py ba-audit`
- **GPU メモリ解放**: `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py unload`

