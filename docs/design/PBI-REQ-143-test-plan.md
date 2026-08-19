# REQ-143 テスト計画書 (Test Plan)

## 1. 自動テスト (Automated Tests)

### フロントエンド ユニット＆コンポーネントテスト
- **対象テストファイル**: `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx`
- **実行コマンド**: `npm test frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx`

#### テストケース詳細仕様と機械的判定基準

##### テスト前準備 (`beforeEach`)
- `vi.clearAllMocks()` を実行し、APIモックの状態を完全に初期化する。

##### テストケース 1: セリフメタデータを持つスナップショットの再編集復元
- **入力条件**:
  - `snapshotsApi.get` のモック戻り値に `params: { speech_bubbles: [{ id: 'b1', text: '保存済みセリフ', x: 100, y: 100, w: 160, h: 140, shape: 'oval', orientation: 'vertical', fontFamily: 'sans-serif', fontSize: 18, textColor: '#000', backgroundColor: '#fff', borderColor: '#000', borderWidth: 2 }], base_snapshot_id: 10, base_image_path: '/clean-base.png' }` を設定。
- **検証項目（アサーション）**:
  1. `snapshotsApi.get` が呼び出され、テキストエリアに `'保存済みセリフ'` が入力値として表示されること (`expect(screen.getByRole('textbox')).toHaveValue('保存済みセリフ')`)。
  2. 初回自動検出 `snapshotsApi.detectBubble` が呼び出されないこと (`expect(snapshotsApi.detectBubble).not.toHaveBeenCalled()`)。
  3. ロードされる `Image.src` がクリーンな元画像パス `'/clean-base.png'` であること。

##### テストケース 2: 「ベース画像差し替え」ボタンとモーダルの開閉
- **入力条件**: `SpeechBubbleEditorModal` をレンダリング。
- **検証項目（アサーション）**:
  1. `title="生成履歴からベース画像を差し替え"` を持つボタンが表示されること (`expect(screen.getByTitle('生成履歴からベース画像を差し替え')).toBeInTheDocument()`)。
  2. ボタンクリック時、`BaseImageSelectModal` の見出し「生成履歴からベース画像を差し替え」が表示されること (`expect(screen.getByText('生成履歴からベース画像を差し替え')).toBeInTheDocument()`)。

##### テストケース 3: 生成履歴からのベース画像差し替えと吹き出し保持
- **入力条件**:
  - 吹き出しが存在する状態で「ベース画像差し替え」モーダルを開き、ID `20`（画像パス `'/new-variant.png'`）のスナップショットカードをクリック。
- **検証項目（アサーション）**:
  1. モーダルが閉じ、エディタのテキストエリアが既存のセリフ値のままであること。
  2. 吹き出しの個数が変化しないこと（1個）。

##### テストケース 4: メタデータ付き新規保存フロー
- **入力条件**:
  - ベース画像をスナップショットID `20`（`workflow_id: 1`）に差し替えた状態で「保存して履歴へ追加」ボタンをクリック。
- **検証項目（アサーション）**:
  1. `snapshotsApi.upload` が呼び出されること。
  2. `snapshotsApi.create` が以下の完全なプロパティ構造で呼び出されること:
     ```typescript
     expect(snapshotsApi.create).toHaveBeenCalledWith(
       expect.objectContaining({
         workflow_id: 1,
         source_snapshot_id: 20,
         params: expect.objectContaining({
           base_snapshot_id: 20,
           base_image_path: '/new-variant.png',
           speech_bubbles: expect.arrayContaining([
             expect.objectContaining({
               id: expect.any(String),
               text: expect.any(String),
               x: expect.any(Number),
               y: expect.any(Number),
               w: expect.any(Number),
               h: expect.any(Number),
               shape: expect.any(String),
               orientation: expect.any(String),
             })
           ])
         })
       })
     )
     ```
  3. `onSaved` および `onClose` コールバックがそれぞれ1回呼び出されること。

---

## 2. 手動検証 (Manual Verification)

### 手順と観測可能な合否基準
1. **新規セリフ編集と保存**:
   - スナップショット一覧からセリフ編集を開き、吹き出しに「テストセリフ1」と入力して保存ボタンを押下。
   - **合否判定**: 保存処理完了後、スナップショット一覧の最先頭に新規カードが追加表示されること。
2. **再編集復元**:
   - 上記で追加された新規カードのセリフ編集ボタンをクリック。
   - **合否判定**: エディタのセリフ入力欄（textarea）に「テストセリフ1」が初期入力状態で表示され、背景キャンバスが文字焼き付け前のクリーンな画像で描画されること。
3. **ベース画像差し替えと差分保存**:
   - エディタの「ベース画像差し替え」ボタンをクリックし、一覧から別スナップショットをクリック。
   - **合否判定**: 入力欄の「テストセリフ1」を保持したまま背景画像が選択した別画像に切り替わり、「保存」実行後に履歴一覧へ新しい差分画像が新規スナップショットとして追加されること。
