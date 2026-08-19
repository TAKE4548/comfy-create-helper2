# REQ-143 詳細設計書: セリフ編集におけるメタデータ保存・再編集およびベース画像差し替え・新規保存機能

## 1. 概要 (Overview)
現在、`SpeechBubbleEditorModal` は保存時に吹き出しを画像上にラスタライズ（合成）した PNG/WebP を生成し、新規スナップショットとして保存しています。
しかし、保存されたスナップショットには吹き出しの個別メタデータ（テキスト、座標、サイズ、フォント・色スタイル等）や、吹き出し合成前のクリーンな元画像への参照が記録されていないため、保存後にセリフの再編集を行おうとすると画像に焼き付いた文字の上にさらに重ねて編集するしかありませんでした。
また、表情差分やポーズ差分などのバリエーション画像に対して同じセリフ構成・吹き出しレイアウトを適用したい場合も、元画像を差し替える手段がありませんでした。

本設計では以下の2つの柱を実装します：
1. **セリフメタ情報の保存と再編集復元**:
   - スナップショット保存時、`params` 内に `speech_bubbles`（吹き出し一覧配列）および `base_snapshot_id` / `base_image_path`（合成前のクリーンなベース画像情報）を記録。
   - セリフ保存済みスナップショットからエディタを開いた場合、クリーンな元ベース画像を読み込み、保存されていた吹き出し群を編集可能な状態で完全復元。
2. **生成履歴からのベース画像差し替えと新規保存**:
   - エディタ内に「ベース画像差し替え」ボタンを設置し、生成履歴（スナップショット一覧）から別のスナップショットを選択してベース画像を切り替え可能にする。
   - 既存の吹き出し構成をそのまま維持し、微調整後に別名（新規スナップショット）として保存可能にする。

---

## 2. 影響分析・対象範囲 (Scope & SSoT Impact)

### 影響を受けるフロントエンドファイル
1. `frontend/src/components/BaseImageSelectModal.tsx` (NEW):
   - 生成履歴（スナップショット一覧）からサムネイル一覧を表示し、ベース画像として選択するモーダルコンポーネント。
2. `frontend/src/components/SpeechBubbleEditorModal.tsx` (MODIFY):
   - スナップショット読み込み時：`params.speech_bubbles` が存在する場合はそのメタデータおよびクリーンなベース画像を復元。存在しない場合は初期自動検出を実行。
   - ヘッダー部に「ベース画像差し替え」ボタン（`ImageIcon`）を設置。
   - 画像差し替え時の画像再ロード・キャンバスリサイズおよび既存吹き出し（`bubbles`）の保持。
   - 保存時：合成画像アップロードとともに、`params.speech_bubbles`, `params.base_snapshot_id`, `params.base_image_path` を付与して新規スナップショットを作成。
3. `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` (MODIFY):
   - メタデータを持つスナップショットの再編集復元テスト。
   - ベース画像差し替えと吹き出し保持テスト。
   - メタデータ付き新規保存フローの検証テスト。

---

## 3. 詳細設計 (Detailed Design)

### 3.1 スナップショットパラメータ構造 (`params`)
スナップショット作成時に `params` に以下のフィールドを含めます：
```typescript
{
  ...parentSnapshotParams,
  speech_bubbles: SpeechBubble[], // 編集中の吹き出し全設定
  base_snapshot_id: number,       // クリーンな元画像のSnapshot ID
  base_image_path: string,        // クリーンな元画像のパス
}
```

### 3.2 `SpeechBubbleEditorModal.tsx` の初期化と再編集復元ロジック
モーダル起動時のスナップショットロードフロー：
```typescript
useEffect(() => {
  let active = true
  const initEditor = async () => {
    try {
      // スナップショット詳細を取得
      const fullSnapshot = await snapshotsApi.get(snapshot.id)
      const params = fullSnapshot.params as Record<string, any> | undefined
      
      const savedBubbles = params?.speech_bubbles as SpeechBubble[] | undefined
      const baseSnapId = params?.base_snapshot_id || fullSnapshot.source_snapshot_id || fullSnapshot.id
      const baseImgPath = params?.base_image_path || fullSnapshot.image_path

      if (!active) return

      if (savedBubbles && Array.isArray(savedBubbles) && savedBubbles.length > 0) {
        // 【再編集モード】保存されたメタデータから吹き出しを完全復元
        setBubbles(savedBubbles)
        setSelectedBubbleId(savedBubbles[0]?.id || null)
        setCurrentSourceSnapshotId(baseSnapId)
        setCurrentImageUrl(baseImgPath || fullSnapshot.image_path || '')
      } else {
        // 【初回新規編集モード】対象画像をそのままベース画像とし、初期検出を実行
        setCurrentSourceSnapshotId(fullSnapshot.id)
        setCurrentImageUrl(fullSnapshot.image_path || '')
        runAutoDetect(fullSnapshot.id)
      }
    } catch (err) {
      console.error('Failed to initialize editor:', err)
      setCurrentImageUrl(snapshot.image_path || '')
    }
  }
  initEditor()
  return () => { active = false }
}, [snapshot.id])
```

### 3.3 ベース画像差し替え処理 (`BaseImageSelectModal.tsx` 連携)
1. ユーザーが「ベース画像差し替え」ボタンをクリックすると `BaseImageSelectModal` が開く。
2. 同一ワークフロー（または履歴）のスナップショット一覧から目的の差分スナップショットを選択。
3. `handleSelectNewBaseImage(selectedSnapshot)`:
   - `currentSourceSnapshotId` を `selectedSnapshot.id` に更新。
   - `currentImageUrl` を `selectedSnapshot.image_path` に更新。
   - 新しい `Image()` がロードされ、キャンバスのスケール・サイズが再計算される。
   - **`bubbles`（吹き出し一覧）は一切変更せずそのまま維持される**。

### 3.4 保存処理 (`handleSave`)
```typescript
const handleSave = async () => {
  if (!imageObj || bubbles.length === 0) return

  setIsSaving(true)
  try {
    const offCanvas = document.createElement('canvas')
    offCanvas.width = imageObj.naturalWidth
    offCanvas.height = imageObj.naturalHeight
    const offCtx = offCanvas.getContext('2d')
    if (!offCtx) throw new Error('Offscreen canvas context generation failed')

    // クリーンなベース画像を描画
    offCtx.drawImage(imageObj, 0, 0, offCanvas.width, offCanvas.height)

    // 吹き出しを描画（1:1フル解像度）
    bubbles.forEach((bubble) => {
      drawSpeechBubble(offCtx, bubble, false, 1, 1, activeFontFamily)
    })

    const blob = await new Promise<Blob | null>((resolve) => offCanvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Canvas blob generation failed')

    const uploadRes = await snapshotsApi.upload(blob)
    
    // ベース画像元の親スナップショット情報を取得
    const parentSnapshot = await snapshotsApi.get(currentSourceSnapshotId)

    const updatedParams = {
      ...(parentSnapshot.params || {}),
      speech_bubbles: bubbles,
      base_snapshot_id: currentSourceSnapshotId,
      base_image_path: currentImageUrl,
    }

    await snapshotsApi.create({
      workflow_id: parentSnapshot.workflow_id,
      image_path: uploadRes.image_path,
      params: updatedParams,
      source_snapshot_id: parentSnapshot.id,
    })

    onSaved()
    onClose()
  } catch (err: any) {
    console.error(err)
    alert('画像の保存に失敗しました: ' + err.message)
  } finally {
    setIsSaving(false)
  }
}
```

---

## 4. UI/UX 仕様
- **再編集のシームレス性**: セリフ保存済み画像を再度クリックしてエディタを開くと、吹き出しのテキストやフォント、位置、サイズ、色がそのままエディタに復元され、文字の修正や移動が即座に行えます。
- **ヘッダーボタン**: モーダルヘッダー右側に `ベース画像差し替え` ボタン（`ImageIcon` 付き、tooltip: "生成履歴からベース画像を差し替えます"）を配置。
- **安全性**: 保存時は常に新規スナップショットとして作成されるため、元画像や再編集元データが誤って上書きされることはありません。
