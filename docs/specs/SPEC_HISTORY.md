# Prompt Surgeon — History ページ仕様書 (SPEC_HISTORY)

**バージョン**: 2.4
**最終更新**: 2026-10-10
**実装ファイル**: `frontend/src/pages/HistoryPage.tsx`（`AlbumListView`, `AlbumDetailView`, `hooks` 分割構成）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md) / [REQ-332設計](../design/REQ-332.md) / [REQ-332検証計画](../design/REQ-332-test-plan.md)

---

## 1. 概要

保存済みスナップショットの一覧表示・アルバム管理・フキダシ編集・一括漫画化バッチ処理を提供するページ。  
ワークフロー・LoRA・TagSet による柔軟な絞り込みと、画像へのセリフ装飾合成、派生スナップショットの系譜管理を行う。

---

## 2. 機能一覧

| 機能 | 説明 |
|---|---|
| スナップショット一覧 | 保存済みスナップショットをグリッド表示（新しい順・古い順ソート、50件単位の無限スクロール・遅延ロード） |
| 複合フィルタ | ワークフロー、使用 LoRA、使用 TagSet による **AND 結合** 絞り込み（一致 0 件時は Empty State とフィルタ解除ボタンを表示） |
| フキダシ・セリフ編集 | スナップショットにフキダシ・セリフ・漫画エフェクトを合成して新規派生保存（元画像は非破壊保持） |
| 漫画化一括バッチ | 複数画像を選択し、LLM によるセリフ自動生成とフキダシ合成をバックグラウンド実行 |
| アルバム作成・管理 | スナップショットを選択してアルバム生成。複数選択・一括追加に対応 |
| アルバム並び替え | 専用ハンドルからの D&D によるカスタム順変更・保存（`PUT /api/albums/{id}/order`）。選択中はD&Dを無効化 |
| アルバム内自動ソート | カスタム順、古い順、新しい順で表示切替 |
| アルバム一括編集・削除 | `MultiSelectToolbar` による複数選択、一括削除 |
| 一括ダウンロード | 選択したスナップショット画像の一括ダウンロード（ZIP / 個別） |
| スナップショット詳細 | 保存時パラメータ、LoRA Stack 構成、派生元スナップショットの確認 |
| 完全全画面プレビュー | 3秒無操作オーバーレイ自動非表示、タップ制限、長辺最大化 |
| 履歴検索・カード表示 | 件数と検索チップを表示し、画像カードは2:3比率で表示 |

---

## 3. レイアウト

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Header] History / ワークフロー・LoRA・TagSet フィルタ / 新規アルバム   │
├────────────────────────────────────────────────────────────────────────┤
│  [スナップショット] / [アルバム] タブ切替                                │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                                          │
│  │画像│ │画像│ │画像│ │画像│ ...（無限スクロール・50件ずつ遅延ロード）   │
│  └────┘ └────┘ └────┘ └────┘                                          │
│                                                                        │
│  [選択したものをアルバムへ] [一括漫画化バッチ] [一括ダウンロード]        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. スナップショット表示 & 編集

保存済みSnapshotはGenerateページの未保存試行履歴と独立したデータである。Generate Galleryにおけるdocument reload epochの差分同期やサムネイル再試行は、保存Snapshot branchの画像、params、metadata、表示には影響しない。試行履歴の表示判定はBE自立キャッシュを正本とし、ComfyUI原画確認プローブや原画missing除外は行わない（詳細は[SPEC_GENERATE](./SPEC_GENERATE.md)）。試行履歴の差分追加によってSnapshot本体・params・metadata・表示を変更しない。Snapshot本体・paramsの保存、一覧件数、表示aspect比は既存仕様を維持する。

### 4-1. HistoryModalPreview コンポーネント (`components/HistoryModalPreview.tsx`)

- 画像の拡大表示 & パラメータ整形表示
- **LoRA Stack の自動検出・テーブル表示**: フラットキー（`${role}_lora_count`, `${role}_lora_name_X` 等）を自動解析してグループ表示。
- **完全全画面プレビュー (REQ-078)**: 3秒操作なしでオーバーレイ自動非表示、Esc/✕/再タップでモーダルと同期クローズ。

#### REQ-316 生成画像メタ情報と現在タグ関連
- `HistoryModalPreview` の情報表示は画像とメタ情報を並列に示し、Workflow/Workflow ID、Prompt ID、キュー受付・メタ情報保存・生成完了・画像保存時刻、現在のアルバム所属を区別して表示する。生成完了時刻はversion1 recordのoptional `completed_at`の実記録を使い、記録や対応する成功jobの実日時がないものは未記録とする。Snapshotは自身の保存済みrecordを正本とし、Snapshot作成時刻で生成完了時刻を代用しない。
- 未保存画像のlocal凍結recordに完了日時が欠ける場合は、同じprompt IDのserver recordから有効な`completed_at`だけを補う。localのparams・seed・assets・workflow・queued_atは維持し、取得失敗やID不一致ではlocalを保持する。日時が記録済みならlocal優先を維持する。
- Snapshot IDがある場合、保存済み `Snapshot.params` 内の生成記録を正本として優先する。snapshot未保存の画像では同期 `readLocalRecordedMetadata` でローカル記録を初回表示し、見つからない場合は非同期server取得へfallbackする。API query cacheのpersistはprompt metadata queryを除外する。どちらにも記録がない値を現在の入力から補完しない。
- 保存済みSnapshot.paramsに含まれる `__prompt_surgeon_metadata_v1` を生成時記録の正本として、生成時の欄名・role・順序・全文、Parameters & Assets、実使用seed、記録済みアセット/LoRA値を表示する。空欄と未記録を区別し、完全性が不確かな記録には警告する。現workflow/master/cache/current inputで旧生成factsを補完しない。記録がない旧画像には現在値を生成時値として表示しない。
- Prompts と Parameters & Assets のtab、欄ごとの折りたたみ/全開閉/コピー、書記素単位の文字数、コピー失敗通知を提供する。Parameters & AssetsではJSONのscalar、null、配列、objectを保持し、未分類の記録キーはキー名と値で表示する。画像の寸法・比率は読込画像のpixel寸法から計算し、形式は取得できるMIME値を示す。
- 現在の汎用TagSet関連とLoRA付属trigger set関連は別リストに示す。保存済みsnapshotに限り、draftで追加/削除し、PATCH `/api/snapshots/{id}` で保存またはキャンセルできる。PATCHはgeneric `tag_sets[{tag_set_id,role}]` と `lora_trigger_sets[{lora_id,trigger_set_id,role}]` を区別し、前者はsnapshot関連、後者はparams内の `__metadata_associations_v1` に保存する。trigger関連は親LoRA IDのsnapshot所属を検証する。LoRA関連の既存role/strengthや生成記録を変更しない。
- キャンセルはdraftを破棄し、保存失敗はdraftを保持してエラーを示す。保存中は対象画像の切替/閉じる等を抑止する。保存済み画像に限った編集とし、未保存プレビューは読取専用とする。Studioのsession draft・同期済み状態・競合/復元動作はこの生成metadata cacheと独立して維持する。履歴・Snapshot件数の上限は生成時メタデータcache上限とは別である。`prompt-surgeon-meta-*` のローカル一時cacheは最大30件、サーバーprompt metadataは最大1000件とする。Snapshot `params` はcache整理後も保存内容として保持する。試行履歴のBEキャッシュ正本化とdocument reload epoch差分同期の詳細は[SPEC_GENERATE](./SPEC_GENERATE.md)を参照し、保存Snapshot branchには影響しない。IndexedDBのpersisted query snapshot maxAgeは10分の既存契約を維持する。API query cacheのIndexedDB期限・fallbackは[SPEC_COMMON 6](./SPEC_COMMON.md)を参照する。
- 局所typecheckと対象テストで実装を確認した。統合3-Gate、全体回帰、ブラウザーシナリオおよび実際のComfyUI生成の完了は、最終検証記録に基づいて別途判断する。

### 4-2. フキダシ・セリフ編集 & 派生スナップショット (`components/SpeechBubbleEditorModal.tsx`)

スナップショット個別に対してリッチなセリフ合成を行うモーダル。
- **フキダシ形状**: オーバル（楕円）、雲型、トゲトゲ（叫び・強調）、四角形
- **文字組 & スタイル**: 縦書き / 横書き切替、フォント選択（Google Web Fonts / ローカル配信フォント）、文字色・背景色・枠線太さ・透明度
- **漫画風エフェクト (`SpeechBubbleMangaFxControls.tsx`)**: 集中線、効果線、スクリーントーン風背景
- **セリフ口調変換 (`SpeechBubbleToneControls.tsx`)**: LLM を用いた口調変換（ツンデレ、お嬢様、敬語等、`POST /api/speech-tone-presets/rewrite`）
- **2系統参照型セリフ・SE一括自動生成 (REQ-291)**:
  - 系統A（直近50件の同一キャラ確定セリフ抽出／TonePresetフォールバック）と系統B（SnowballStemmer単語類似度Top-1シーン）による2系統コンテキスト参照。
  - Qwen3.5-9B-Claude との連携。REQ-296改訂: シーン生成専用のVLM要求はsystem/user双方を同一のJSON生成タスクとし、`response_format.json_schema` とサーバー側検証を使う。空応答、非JSON、スキーマ不一致、途中終了などは安全なエラー分類で扱い、生のモデル出力や入力内容をログ・API応答に含めない。
  - REQ-296改訂: LM Studioのロード済みインスタンスIDを推論と解放で共用する。`POST /api/v1/models/unload` に `{"instance_id": "..."}` を渡し、HTTP成功に加えて応答IDの一致と `GET /api/v1/models` での対象ID消失を確認した場合だけ `vram_unloaded=true` とする。失敗時は1回再試行し、解放失敗で推論の元エラーを置き換えない。`/v1/models/unload` と空本文は現行契約ではない。フラグは対象インスタンスの消失を示し、GPU総使用量0を意味しない。
  - sub話者キャラ同定（`TagSet.name` 照合）、SE装飾（枠なし黄色文字）、および 1024×1024px 実ピクセル座標系への「80点ハイブリッド配置」変換。
  - 初出キャラ時のプリセット作成モーダルと推論の並行オンボーディング、および `isCancelledRef` / `createdPresetIdRef` / `pendingDraftResultRef` による合流レース防止と先行キャンセル救済展開フック（`useSceneSpeechGeneration`）。
- **フキダシ自動検出**: OpenCV による画像内フキダシ領域・ROI の自動検出 (`POST /api/snapshots/{id}/detect-bubble`)
- **派生スナップショットの系譜管理 (Lineage)**:
  - 元の生成画像（親スナップショット）はそのまま非破壊で保持し、セリフ合成後の画像を**新しいスナップショット**として保存する。
  - 新規スナップショットの `source_snapshot_id` に親スナップショットの ID を記録し、派生元を追跡可能にする。
  - 親スナップショットが削除された場合は、DB の外部キー制約（`ondelete="SET NULL"`）により `source_snapshot_id` が `null` となり、派生画像は独立して安全に維持される。

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
- **D&D並び替え**: `MouseSensor`（8px移動）/ `TouchSensor`（500ms長押し）による誤動作防止。専用ハンドルから開始し、選択中は無効。確定後に `PUT /api/albums/{id}/order`（ペイロード: `{ "ordered_ids": number[] }`）で保存。同じ日付の表示順は手動順を保つ。
- **一括操作**: 複数選択は検索・フィルタ後の表示対象に適用する。対象アルバムへの追加はインライン確認を経て実行し、成功時だけ確認UIを閉じる。失敗時は選択ドラフトを保持する。
- **一括削除**: `POST /api/albums/{id}/items/delete` でアルバムからの一括削除。
- アルバムから項目を除外しても、保存済みSnapshot自体は削除しない。アルバムの追加は非同期処理が成功した場合だけUIを閉じ、失敗時は入力内容を保持する。
- アルバム一覧カードには項目数、日付、最大3枚の画像スタックと説明を表示する。説明は `AppSetting` に保存される。0件・1件・3件の表示に対応する。

### 5-3. Snapshot選択・ダウンロード
- 検索チップと件数は現在の検索結果に対応する。ZIPダウンロードは選択中のSnapshotだけを含め、失敗時はエラーを表示する。
- 全画面プレビューではFit 100%/200%、パン、A/B比較を提供し、Escapeで閉じる。

---

## 6. API 呼び出し

| 操作 | エンドポイント | ペイロード / パラメータ |
|---|---|---|
| スナップショット一覧 | `GET /api/snapshots` | `?workflow_id={id}&lora_id={id}&tag_set_id={id}&limit=50&offset=0` |
| スナップショット詳細 | `GET /api/snapshots/{id}` | |
| スナップショット削除 | `DELETE /api/snapshots/{id}` | |
| フキダシ自動検出 | `POST /api/snapshots/{id}/detect-bubble` | |
| アルバム一覧 | `GET /api/albums` | |
| アルバム作成 | `POST /api/albums` | `{ "name": string, "snapshot_ids": number[] }` |
| アルバム表示順更新 | `PUT /api/albums/{id}/order` | `{ "ordered_ids": number[] }` |
| アルバム並び替え | `PUT /api/albums/reorder` | `{ "ordered_ids": number[] }` |
| アルバムアイテム一括削除 | `POST /api/albums/{id}/items/delete` | `{ "snapshot_ids": number[] }` |
| 漫画化バッチジョブ登録 | `POST /api/speech-batch/jobs` | |
| 漫画化アクティブジョブ取得 | `GET /api/speech-batch/jobs/active` | |
| 口調書き換え実行 | `POST /api/speech-tone-presets/rewrite` | `{ "text": string, "prompt": string }` |

---

*本ドキュメントは現行の HistoryPage 実装に準拠した正本です。*
