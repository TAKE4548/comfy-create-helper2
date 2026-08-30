# 障害調査報告書 (Incident Report)

## 1. 障害概要
セリフ編集（吹き出し編集）機能におけるしっぽ（Tail）の挙動および微調整機能に関して、以下の3点の課題・不具合が確認された。

1. **吹き出し移動時のしっぽ詳細設定消失**: 吹き出し本体をドラッグ移動した際、しっぽの微調整設定（`isFineTuning`, `baseAngleOffset`, `baseSpreadRatio` 等）がリセット（無効化）されてしまう。
2. **頂点・接点の吹き出し内部侵入による描画崩壊**: しっぽの先端（頂点）や接点を吹き出しの内部までドラッグ移動できてしまい、パスが自己交差して吹き出しの形状や枠線が破綻・崩壊する。
3. **接点調整の仕様改善要望（1点＋幅から2点独立操作へ）**: 現在のしっぽ接点調整は「中心角オフセット（1点）＋幅倍率（スライダー）」となっているが、吹き出し外周上の2か所の接点をそれぞれ個別にドラッグ・調整できる方が直感的で操作しやすい。

---

## 2. 再現手順

### 事象 1 (吹き出し移動によるしっぽ微調整設定の消失)
1. セリフ編集モーダルを開き、しっぽ付き吹き出しを選択する。
2. 「🎯 しっぽ微調整モード」をONにし、基部幅スライダーや基部接点ハンドルをドラッグして微調整を行う。
3. 吹き出し本体をドラッグしてキャンバス上で移動させる。
4. **結果**: `tail` オブジェクトが `{ x, y }` のみで再生成され、`isFineTuning` やオフセット・幅倍率のプロパティが欠落して初期状態（微調整OFF）に戻る。

### 事象 2 (しっぽ先端・接点の内部侵入による描画破綻)
1. セリフ編集モーダルでしっぽ先端ハンドル（青丸）または接点ハンドル（橙丸）をドラッグする。
2. ハンドルを吹き出しの外周を越えて吹き出しの中心・内部に向かってドラッグする。
3. **結果**: 頂点座標のクランプや進入制限がないため、`ctx.ellipse` / `ctx.roundRect` の結合パスが自己交差し、吹き出しの塗りや枠線が反転・欠落する。

### 事象 3 (接点調整の操作性)
1. 現行仕様では接点ハンドルが1点（中心角度）のみであり、接点の幅はモーダル上部のスライダー（`baseSpreadRatio`）でしか変更できない。
2. 左右または上下の接点を非対称に広げたり、外周に沿って各接点を直感的にドラッグ配置することができない。

---

## 3. 根本原因 (Root Cause Analysis)

### 1. 吹き出し移動時のしっぽ詳細設定消失
- **該当箇所**: 
  - `frontend/src/components/SpeechBubbleEditorModal.tsx:L654-L665`
  - `frontend/src/components/SpeechBubbleEditorModal.tsx:L350-L356` (`handleDuplicateBubble`)
- **原因**: 
  - `SpeechBubbleEditorModal.tsx` のドラッグ移動処理（`draggingState.type === 'bubble'`）において、移動後の bubble オブジェクト生成時に `tail: initB.tail ? { x: initB.tail.x + dx, y: initB.tail.y + dy } : undefined` と記述されている。
  - スプレッド演算子（`...initB.tail`）が使用されていないため、`isFineTuning`, `baseAngleOffset`, `baseSpreadRatio` などの詳細パラメータがすべて破棄されている。複製処理（`handleDuplicateBubble`）も同様。

### 2. 頂点・接点の吹き出し内部侵入による描画崩壊
- **該当箇所**: 
  - `frontend/src/components/SpeechBubbleEditorModal.tsx:L666-L695` (`handleMouseMove`)
  - `frontend/src/utils/speechBubbleRenderer.ts:L553-L623` (`drawBubbleShape`)
- **原因**: 
  - マウスドラッグ時の座標計算において、しっぽ先端（頂点）および接点が吹き出し外周（バウンディングボックス／楕円半径）より内側に入らないようにするクランプ（幾何的進入制限）が存在しない。
  - レンダラー側（`drawBubbleShape`）でも先端が内部にある場合のフォールバックや交差補正がないため、楕円・角丸の境界線と先端を結ぶパスが自己交差し描画が崩壊する。

### 3. 接点調整のデータ構造とUI仕様
- **該当箇所**: 
  - `frontend/src/types/speechBubble.ts:L92-L98` (`BubbleTail` インターフェース)
  - `frontend/src/utils/speechBubbleRenderer.ts:L760-L809` (`getTailBasePosition`)
  - `frontend/src/components/SpeechBubbleEditorModal.tsx:L1144-L1185`
- **原因**: 
  - `BubbleTail` のデータモデルが `baseAngleOffset`（中心角度1点）と `baseSpreadRatio`（幅倍率）で設計されているため、キャンバス上には1つの接点ハンドルしか描画・制御できない。
  - 2か所の接点を外周上で独立制御するには、データ構造（2つの接点位置／角度）の拡張と、キャンバス上の2つの接点ハンドルの描画・ドラッグ制御への改修が必要。

---

## 4. 障害分類
- **分類**: **Type B (Specification & UI/UX Enhancement / 一部 Type A 実装不具合を含む複合事象)**
- **判定理由**:
  - 事象1（プロパティ消失）は明らかな実装不具合（Type A）ですが、事象2（外周進入防止制限の幾何計算・仕様策定）および事象3（1点＋幅から2接点独立操作へのデータモデルおよびUI操作仕様の変更）は設計・仕様拡張（Type B）に該当するため。

---

## 5. 対策方針 (概要)
1. **しっぽプロパティの保持**:
   - `SpeechBubbleEditorModal.tsx` の移動・複製処理で `tail: initB.tail ? { ...initB.tail, x: initB.tail.x + dx, y: initB.tail.y + dy } : undefined` とし、詳細プロパティを完全保持する。
2. **頂点・接点の内側入り込み防止ガード**:
   - しっぽ頂点ドラッグ時、吹き出し中心からの距離・角度を判定し、吹き出し外周（楕円の外周または角丸矩形の境界）から一定以上の外側領域にクランプする。
   - レンダラー側でも安全策として先端が外周内部に入らない幾何計算を適用する。
3. **2点独立接点調整の導入**:
   - `BubbleTail` に2つの接点を表すプロパティ（例: `baseAngle1`, `baseAngle2` または相対外周位置）を持たせ、後方互換性を保ちながら2つの接点ハンドルをキャンバス上に描画・個別ドラッグ可能にする。
