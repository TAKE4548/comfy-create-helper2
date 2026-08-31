# Prompt Surgeon — History ページ仕様書 (SPEC_HISTORY)

**バージョン**: 2.0  
**最終更新**: 2026-09-01  
**実装ファイル**: `frontend/src/pages/HistoryPage.tsx`（`AlbumListView`, `AlbumDetailView`, `hooks` 分割構成）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

保存済みスナップショットの一覧表示・アルバム管理・フキダシ編集・一括漫画化バッチ処理を提供するページ。  
ワークフロー・LoRA・TagSet による柔軟な絞り込みと、画像へのセリフ装飾合成、派生スナップショットの管理を行う。

---

## 2. 機能一覧

| 機能 | 説明 |
|---|---|
| スナップショット一覧 | 保存済みスナップショットをグリッド表示（新しい順・古い順ソート、遅延読み込み対応） |
| 複合フィルタ | ワークフロー、使用 LoRA、使用 TagSet による絞り込み |
| フキダシ・セリフ編集 | スナップショットにフキダシ・セリフ・漫画エフェクトを合成して新規派生保存 |
| 漫画化一括バッチ | 複数画像を選択し、LLM によるセリフ自動生成とフキダシ合成をバックグラウンド実行 |
| アルバム作成・管理 | スナップショットを選択してアルバム生成。複数選択・一括追加に対応 |
| アルバム並び替え | D&D によるカスタム順変更・保存。複数選択時のグループ移動に対応 |
| アルバム内自動ソート | カスタム順、古い順、新しい順で表示切替 |
| アルバム一括編集・削除 | `MultiSelectToolbar` による複数選択、一括削除 |
| 一括ダウンロード | 選択したスナップショット画像の一括ダウンロード（ZIP / 個別） |
| スナップショット詳細 | 保存時パラメータ、LoRA Stack 構成、派生元スナップショットの確認 |
| 完全全画面プレビュー | 3秒無操作オーバーレイ自動非表示、タップ制限、長辺最大化 |

---

## 3. レイアウト

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Header] History / ワークフロー・LoRA・TagSet フィルタ / 新規アルバム   │
├────────────────────────────────────────────────────────────────────────┤
│  [スナップショット] / [アルバム] タブ切替                                │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                                          │
│  │画像│ │画像│ │画像│ │画像│ ...（無限スクロール・遅延ロード）         │
│  └────┘ └────┘ └────┘ └────┘                                          │
│                                                                        │
│  [選択したものをアルバムへ] [一括漫画化バッチ] [一括ダウンロード]        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. スナップショット表示 & 編集

### 4-1. HistoryModalPreview コンポーネント (`components/HistoryModalPreview.tsx`)

- 画像の拡大表示 & パラメータ整形表示
- **LoRA Stack の自動検出・テーブル表示**: フラットキー（`${role}_lora_count`, `${role}_lora_name_X` 等）を自動解析してグループ表示。
- **完全全画面プレビュー (REQ-078)**: 3秒操作なしでオーバーレイ自動非表示、Esc/✕/再タップでモーダルと同期クローズ。

### 4-2. フキダシ・セリフ編集 (`components/SpeechBubbleEditorModal.tsx`)

スナップショット個別に対してリッチなセリフ合成を行うモーダル。
- **フキダシ形状**: オーバル（楕円）、雲型、トゲトゲ（叫び・強調）、四角形
- **文字組 & スタイル**: 縦書き / 横書き切替、フォント選択（Google Web Fonts / ローカル配信フォント）、文字色・背景色・枠線太さ・透明度
- **漫画風エフェクト (`SpeechBubbleMangaFxControls.tsx`)**: 集中線、効果線、スクリーントーン風背景
- **セリフ口調変換 (`SpeechBubbleToneControls.tsx`)**: LLM を用いた口調変換（ツンデレ、お嬢様、敬語等、`POST /api/speech-tone-presets/rewrite`）
- **フキダシ自動検出**: OpenCV による画像内フキダシ領域・ROI の自動検出 (`POST /api/snapshots/{id}/detect-bubble`)
- **派生保存**: 合成後の画像を新規スナップショットとして保存し、`source_snapshot_id` で元スナップショットと系譜を紐付け。

### 4-3. 漫画化一括バッチ処理 (`components/BatchSpeechTransformModal.tsx`)

複数枚のスナップショットを選択して一括で漫画化処理を行うバックグラウンドジョブ機能。
- LLM によるシーン解析・セリフ下書き生成（`POST /api/llm-prompts/speech-draft`）
- 選択されたフキダシプリセットと口調プリセットに基づく一括合成ジョブ登録（`POST /api/speech-batch/jobs`）
- ジョブ進行状況のリアルタイムポーリング・キャンセル・再試行管理

---

## 5. アルバム管理

### 5-1. コンポーネント構成
- `AlbumListView.tsx`: アルバムカード一覧、新規作成、アルバム削除
- `AlbumDetailView.tsx`: アルバム内スナップショットのグリッド表示、カスタム並び替え（D&D）、一括削除

### 5-2. 並び替え & 一括操作
- **D&D並び替え**: `MouseSensor`（8px移動）/ `TouchSensor`（500ms長押し）による誤動作防止。確定後に `PUT /api/albums/{id}/order` で保存。
- **複数選択グループ移動**: `MultiSelectToolbar` 連携により、選択アイテムを順序維持で一括移動。
- **一括削除**: `POST /api/albums/{id}/items/delete` でアルバムからの一括削除。

---

## 6. API 呼び出し

| 操作 | エンドポイント |
|---|---|
| スナップショット一覧 | `GET /api/snapshots?workflow_id={id}&lora_id={id}&tag_set_id={id}` |
| スナップショット詳細 | `GET /api/snapshots/{id}` |
| スナップショット削除 | `DELETE /api/snapshots/{id}` |
| フキダシ自動検出 | `POST /api/snapshots/{id}/detect-bubble` |
| アルバム一覧 | `GET /api/albums` |
| アルバム作成 | `POST /api/albums` |
| アルバム表示順更新 | `PUT /api/albums/{id}/order` |
| アルバム並び替え | `PUT /api/albums/reorder` |
| アルバムアイテム一括削除 | `POST /api/albums/{id}/items/delete` |
| 漫画化バッチジョブ登録 | `POST /api/speech-batch/jobs` |
| 漫画化アクティブジョブ取得 | `GET /api/speech-batch/jobs/active` |
| 口調書き換え実行 | `POST /api/speech-tone-presets/rewrite` |

---

*本ドキュメントは現行の HistoryPage 実装に準拠した正本です。*
