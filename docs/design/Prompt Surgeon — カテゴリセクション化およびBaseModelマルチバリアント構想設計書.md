# Prompt Surgeon — カテゴリセクション化およびBaseModelマルチバリアント構想設計書 (RFC)

- **ステータス**: 提案 (RFC / Proposal)
- **作成日**: 2026-09-17
- **対象ドメイン**: Asset Management (TagsPage, LoRAsPage), GeneratePage (AssetPanel, AddAssetModal), Backend (DB Schema, Reorder API)
- **関連仕様書**: `docs/specs/SPEC_TAGS.md`, `docs/specs/SPEC_COMMON.md`, `docs/specs/SPEC_GENERATE.md`

---

## 1. 背景と課題

Prompt Surgeon では、タグセット（TagSet）および LoRA のカード一覧画面において、ドラッグ＆ドロップ（D&D）による手動並び替え機能を提供している。しかし、現行の実装およびデータ構造には以下の構造的な課題が存在する。

### 1.1 フィルタ適用時の並び替え不可と、単一フラットリストの破綻
- 現行の `TagsPage.tsx` / `LoRAsPage.tsx` では、検索クエリやカテゴリ・BaseModelフィルタが有効な場合、D&D操作が無効化（`isDndActive = false`）されている。
- これを単純に解除してフィルタ結果のまま並び替えを許可した場合、以下の致命的な問題が発生する：
  1. **DBレベルのソート順衝突**: バックエンドの `/reorder` API は受け取った ID 配列のインデックス（0, 1, 2...）をそのまま `sort_order` に上書きするため、フィルタ外のカードと番号が重複し、フィルタ解除時にフィルタしていたグループが全体の最上位へ強制ワープする。
  2. **認知・UXの破綻**: 全体の中で飛び飛びに存在するアイテム群だけを入れ替えた場合、フィルタ解除時に間に別カテゴリのカード（衣装や背景など）が挟まり、「同シリーズのキャラクターで固めて並べた」つもりが全体表示では全く固まって見えない。

### 1.2 モデル別のカード増殖による一覧性の低下
- 現状、BaseModel（Anima, Illustrious, SDXL, Pony 等）の違いに対しては、同一キャラクターであっても「キャラA (Anima用)」「キャラA (Illustrious用)」のように別々の物理カードとして登録・管理されている。
- これにより以下の弊害が生じている：
  - 同一キャラクターのカードが乱立し、ライブラリが肥大化する。
  - シリーズ順に並べようとしても、モデル別のカードが混在して順序関係が複雑化する。
  - BaseModelフィルタをかけて整理しようとすると、前述の「フィルタ中の並び替え問題」に直面する。

### 1.3 生成画面（GeneratePage）でのモデル切り替え摩擦
- ワークフローのBaseModelを切り替えた際、適用中のTagSetやLoRAを手動で別モデル用のカードに選び直す必要があり、生成フローの自動化・効率化を阻害している。

---

## 2. コアコンセプト

本設計では、これらの課題を抜本的に解決するため、以下の2つの柱を導入する。

```text
┌────────────────────────────────────────────────────────┐
│ 論理エンティティ（1 Card = 1 Character / 1 Concept）   │
│ 例: 「月村手毬」                                       │
├──────────────────────────┬─────────────────────────────┤
│ Anima バリアント         │ Illustrious バリアント      │
│ - 自然言語タグセット     │ - danbooru/品質タグセット   │
│ - Anima用LoRAファイル    │ - Illustrious用LoRAファイル │
│ - 最適推奨強度 (0.8)     │ - 最適推奨強度 (1.0)        │
└──────────────────────────┴─────────────────────────────┘
```

1. **「論理アセット」と「物理モデル別実装（バリアント）」の分離**:
   - 1枚のカードは「キャラクターという論理概念」を表す。
   - カード内に、各BaseModel（Anima, Illustrious 等）に対応するタグ定義やLoRAファイル設定をバリアント（プロファイル）として内包する。
   - カードの並び順（`sort_order`）はBaseModelから完全に独立し、「作品・キャラクターの純粋な並び順」として一元管理される。
2. **カテゴリ単位のセクション表示とスコープ化された並び替え**:
   - 全体1本のフラットリストではなく、「キャラクター」「衣装」「ポーズ」「背景」などのカテゴリごとにセクションを分割。
   - 並び順（`sort_order`）はカテゴリ内でスコープ化され、カテゴリを跨いだ順序破壊を原理的に防止する。

---

## 3. UI/UX 詳細設計

### 3.1 管理画面（TagsPage / LoRAsPage）のセクション表示

```text
┌────────────────────────────────────────────────────────────────────────┐
│ [検索バー]  [BaseModelフィルタ (任意)]  [+ 新規登録]                   │
├────────────────────────────────────────────────────────────────────────┤
│ ▼ キャラクター (24件) [セクション内件数] [展開/折畳]                   │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                     │
│ │[Thumb]       │ │[Thumb]       │ │[Thumb]       │ ← セクション内で    │
│ │キャラA       │ │キャラB       │ │キャラC       │    自由に D&D並替え │
│ │[Anima][Illu] │ │[Anima]       │ │[Illu][SDXL]  │   （同シリーズ集約）│
│ └──────────────┘ └──────────────┘ └──────────────┘                     │
├────────────────────────────────────────────────────────────────────────┤
│ ▼ 衣装・装飾 (12件)                                                    │
│ ┌──────────────┐ ┌──────────────┐                                      │
│ │[Thumb]       │ │[Thumb]       │                                      │
│ │セーラー服     │ │メイド服      │                                      │
│ └──────────────┘ └──────────────┘                                      │
├────────────────────────────────────────────────────────────────────────┤
│ ▼ 未分類 (3件)                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

- **アコーディオン形式のセクション配置**:
  - 各カテゴリを独立したセクションとして縦スクロール配置。
  - セクションヘッダーにはカテゴリ名、登録件数、折りたたみトグルを配置。開閉状態は `localStorage` に保持。
  - カード数の多い「キャラクター」を折りたたんで「背景」に素早くアクセス可能。
  - カテゴリが未設定のカードは最下部の「未分類」セクションに集約。
- **カード上のバリアントバッジ表示**:
  - カードフッターに、対応しているBaseModel（例: Anima, Illustrious）のタグバッジを表示。どのモデルに対応済みかが一目で判別可能。

### 3.2 スコープ化された並び替え（D&D）ルール

1. **同一セクション内のD&D**:
   - セクション内のカード順序のみを入れ替え。
   - バックエンドには `{ category_id: X, ordered_ids: [...] }` を送信。
   - 他カテゴリのカードの `sort_order` には一切影響を与えない。
2. **セクション間を跨ぐD&D（カテゴリ変更）**:
   - カードを別カテゴリのセクションへドラッグ＆ドロップ可能（dnd-kit の複数コンテナ対応）。
   - ドロップ先のカテゴリへ `category_id` を自動更新し、挿入位置の `sort_order` を再計算。
   - 編集モーダルを開くことなく、直感的なカテゴリ移動・分類を実現。
3. **BaseModelフィルタ適用時の挙動**:
   - カード内に各モデル定義が内包されているため、BaseModelフィルタは「そのモデルに対応するバリアントを持つカードのみをハイライトまたは絞り込む」ビューフィルタとして機能。
   - 並び順自体は「論理カード順」であるため、フィルタの有無によって順序関係が矛盾しない。

### 3.3 カード詳細・編集モーダル（バリアント管理）

- モーダル内に「モデル別バリアント」タブ / アコーディオンを新設。
- **共通デフォルト設定**: 全モデル共通のトリガーワードやベースタグ。
- **モデル別オーバーライド**:
  - 例: 「Anima」タブ → Anima用の推奨強度、Anima用LoRAファイル名、自然言語構文タグ
  - 例: 「Illustrious」タブ → Illustrious用の推奨強度、danbooruタグ
- 未設定のモデルに対しては「+ モデル設定を追加」からワンクリックで追加可能。

---

## 4. データモデル設計

### 4.1 タグセット（TagSet）

```sql
-- 論理カードテーブル
CREATE TABLE tag_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES tagset_categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    thumbnail_path VARCHAR(512),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- モデル別バリアントテーブル
CREATE TABLE tag_set_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_set_id INTEGER NOT NULL REFERENCES tag_sets(id) ON DELETE CASCADE,
    is_common_default BOOLEAN NOT NULL DEFAULT FALSE, -- 全モデル共通デフォルトフラグ
    default_tags TEXT NOT NULL DEFAULT '[]', -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- バリアントと対応BaseModelの中間テーブル（多対多: 互換モデル間での定義共有対応）
CREATE TABLE tag_set_variant_base_models (
    variant_id INTEGER NOT NULL REFERENCES tag_set_variants(id) ON DELETE CASCADE,
    base_model_id INTEGER NOT NULL REFERENCES base_models(id) ON DELETE CASCADE,
    PRIMARY KEY (variant_id, base_model_id)
);

-- サブセット（衣装・表情等のバリエーション）
CREATE TABLE tag_subsets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES tag_set_variants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]' -- JSON string
);

CREATE INDEX idx_tag_sets_category_sort ON tag_sets(category_id, sort_order);
```

### 4.2 LoRA

```sql
-- 論理カードテーブル
CREATE TABLE loras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_name VARCHAR(255) NOT NULL, -- 表示名/論理名
    description TEXT,
    category_id INTEGER REFERENCES lora_categories(id) ON DELETE SET NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    thumbnail_path VARCHAR(512),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- モデル別LoRAバリアント（物理ファイル紐付け）
CREATE TABLE lora_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lora_id INTEGER NOT NULL REFERENCES loras(id) ON DELETE CASCADE,
    file_path VARCHAR(512) NOT NULL, -- 実際の .safetensors ファイル名/相対パス
    recommended_strength_min FLOAT,
    recommended_strength_max FLOAT,
    default_strength FLOAT DEFAULT 1.0,
    trigger_words TEXT DEFAULT '[]', -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- バリアントと対応BaseModelの中間テーブル（多対多: 例 Illustrious と NoobAI の共有など）
CREATE TABLE lora_variant_base_models (
    variant_id INTEGER NOT NULL REFERENCES lora_variants(id) ON DELETE CASCADE,
    base_model_id INTEGER NOT NULL REFERENCES base_models(id) ON DELETE CASCADE,
    PRIMARY KEY (variant_id, base_model_id)
);

CREATE INDEX idx_loras_category_sort ON loras(category_id, sort_order);
```

### 4.3 API エンドポイント改修

| エンドポイント | メソッド | 説明 |
| :--- | :--- | :--- |
| `/api/tag-sets/reorder` | PUT | ペイロード: `{"category_id": int | null, "ordered_ids": int[]}`<br>指定カテゴリ内のみ `sort_order` を 0, 1, 2... に更新 |
| `/api/loras/reorder` | PUT | 同上（LoRA用） |
| `/api/tag-sets/{id}/category` | PATCH | セクション間ドラッグ用。`category_id` と `sort_order` を即時移動更新 |
| `/api/loras/{id}/category` | PATCH | 同上 |

---

## 5. GeneratePage（生成画面）との連携・自動解決

本アーキテクチャの最大のメリットは、画像生成時のアセット自動解決（Auto-Resolution）にある。

1. **アセット追加モーダル（AddAssetModal.tsx）の挙動**:
   - カード一覧には論理カードが1件ずつ表示される（同じキャラの重複なし）。
   - 現在選択中のワークフローの BaseModel に対応したバリアントを持つカードが優先表示される。
2. **ワークフロー切り替え時の自動追従**:
   - 例えばプロンプトに「月村手毬」アセットが適用されている状態で、ワークフローを「Anima」から「Illustrious」へ切り替えた場合：
     - `AppliedAsset` が自動的に「月村手毬」の Illustrious バリアントを再参照。
     - LoRAファイル指定およびトリガーワード、プロンプトタグが Illustrious 用の定義へと自動更新される。
   - モデル非対応のアセットがある場合は、アセットパネル上で「⚠️ 現在のBaseModel（Illustrious）向け定義がありません」と警告バッジが表示され、誤生成を防止。

---

## 6. 段階的移行ロードマップ (Migration Plan)

- **Phase 1: カテゴリセクション化 & セクション内D&Dの実装**
  - DBスキーマは現状のままとし、フロントエンド（TagsPage, LoRAsPage）をアコーディオンセクション表示に変更。
  - バックエンドの `/reorder` API をカテゴリ単位（`category_id` スコープ）の更新に対応させる。
  - これにより、現状のカード構造のままでも「同シリーズのキャラをキャラ枠内で並べる」要望が即座に満たされる。
- **Phase 2: DBスキーマ拡張（バリアントテーブル新設）と自動マイグレーション**
  - Alembic マイグレーションを作成し、`tag_set_variants` / `lora_variants` テーブルを新設。
  - 既存の TagSet / LoRA データを「共通デフォルトバリアント」または「紐づくBaseModelバリアント」へ自動移行。
- **Phase 3: 新規登録時重複検知およびカード統合アシスタント（恒久活用）**
  - 新規作成モーダル（New）入力時に既存カードとの重複・類似を自動検知し、既存カードの新規バリアントとして統合するか、別カードとして作成するかをユーザーに問い合わせる恒久的ガードを提供。
  - 過去の重複カードの一括整理用として、新規登録モーダル内等から起動可能なモーダル形式の「カード統合アシスタント」を提供し、ワンクリックで安全にバリアント統合・クリーンアップを可能とする。
- **Phase 4: GeneratePage の動的バリアント自動解決（将来検討・保留）**
  - ワークフローのBaseModelに応じた動的プロンプト/LoRA解決ロジックの検討。
  - ※注意: LoRA適用は複数プロンプトエリアやLoRAスタックへの波及が大きく、またユーザーがあえてトリガーワードの一部を削る手動編集のケースもあるため、機械的自動置換による破壊リスクを考慮し、今回の整理要求スコープからは切り離して将来検討（保留）とする。