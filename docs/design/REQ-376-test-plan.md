# REQ-376 テスト計画書
# モバイルLoRA／Tag Set：一覧カードの情報整理と縦スクロールの一本化

---

## 1. 概要と検証方針 (Test Strategy & Placement Plan)

本テスト計画は、PBI REQ-376で定められたモバイル環境（画面幅767px以下）におけるLoRA一覧・Tag Set一覧カードの受け入れ条件（AC-1〜AC-12）を網羅的に検証するためのテストケース配置および実行計画を定義する。

### 1.1 テスト配置計画 (Test Placement Plan [MUST [W-DD-PLACE]])
新規のチケット番号付きテストファイル（`*req*`, `*pbi*`等）の新設は**厳格に禁止**。既存のコロケーション／レイヤー別テストファイルを拡張する：
- **`frontend/src/pages/__tests__/LoRAsPage.test.tsx`**:
  LoRAs一覧カードの表示項目（AC-1, AC-2, AC-3, AC-8, AC-9）、内部スクロール撤去（AC-4）、Stickyカテゴリ見出し（AC-5）、サムネイル中央配置（AC-7）、既存機能維持（AC-10）、境界値・異常系（AC-11）、PCデスクトップBaseline維持（AC-12）を検証。
- **`frontend/src/pages/__tests__/TagsPage.test.tsx`**:
  Tag Set一覧カードの表示項目（AC-1, AC-2, AC-3, AC-8, AC-9）、内部スクロール撤去（AC-4）、Stickyカテゴリ見出し（AC-5）、サムネイル中央配置（AC-7）、既存機能維持（AC-10）、境界値・異常系（AC-11）、PCデスクトップBaseline維持（AC-12）を検証。
- **`frontend/src/pages/__tests__/AssetCardInteractions.test.tsx`**:
  編集・削除ボタンのタップ領域（44×44px以上）、非重複クリアランス、D&D並べ替えハンドル・カードタップ・詳細モーダル起動との相互非競合（AC-6）を検証。

すべての受け入れテストケースにはタグ `[REQ-376/AC-n]` を付与し、テストケース名フィルタによる単独・一括実行を保証する。

---

## 2. 受け入れ基準・テストマトリクス (AC Traceability Matrix)

| AC番号 | 対象画面・コンポーネント | 検証内容 | 配置テストファイル | テストケース名タグ |
|---|---|---|---|---|
| AC-1 | LoRAsPage / TagsPage | 幅767px以下でカード外形高が320px固定となり、カード同士の重なり・はみ出しがないこと | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-1]` |
| AC-2 | LoRAsPage / TagsPage | 下部情報がタイトル、説明、対象Base Modelの3項目のみでこの順序で表示され、タイトル・説明が各最大2行、モデル行が下端に揃うこと | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-2]` |
| AC-3 | LoRAsPage / TagsPage | 3行以上のタイトル・説明、長いモデル名で超過部分が省略（line-clamp-2, truncate）され外へはみ出さないこと | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-3]` |
| AC-4 | LoRAsPage / TagsPage | モバイル下部情報エリアに `overflow-y-auto` がなく、`overflow-hidden` で独立スクロールが存在しないこと | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-4]` |
| AC-5 | LoRAsPage / TagsPage | カテゴリ見出しがSticky配置でスクロール上端（pt-0）に接し、カード内に重複カテゴリバッジが表示されないこと | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-5]` |
| AC-6 | LoRAsPage / TagsPage | 編集・削除ボタンが重ならず各44×44px以上の領域を持ち、カードタップやD&Dと競合しないこと | `AssetCardInteractions.test.tsx` | `[REQ-376/AC-6]` |
| AC-7 | LoRAsPage / TagsPage | サムネイル画像フレームがモバイルでカード中央に配置され、画像なし時も中央に表示されること | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-7]` |
| AC-8 | LoRAsPage / TagsPage | 一覧から除外された項目（トリガー、強度、パス、タグ、コピー）が詳細モーダルで従来通り確認できること | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-8]` |
| AC-9 | LoRAsPage / TagsPage | 複数Base Modelが ` · ` で1行に収まり、カードタップにより詳細画面で全件を確認できること | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-9]` |
| AC-10 | LoRAsPage / TagsPage | 検索、フィルタ、カテゴリ折りたたみ、D&D並べ替え、複数選択モード等の既存機能が失われないこと | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-10]` |
| AC-11 | LoRAsPage / TagsPage | 幅360px、極端な長文、説明なし、画像なし、未解決モデルID等の異常系でレイアウトが破綻しないこと | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-11]` |
| AC-12 | LoRAsPage / TagsPage | 画面幅768px以上（PCデスクトップ）で従来表示（トリガーワード、タグチップ、カード内スクロール）が完全維持されること | `LoRAsPage.test.tsx`<br>`TagsPage.test.tsx` | `[REQ-376/AC-12]` |

---

## 3. テスト層別計画 (Test Tiers)

### 3.1 Tier 1: 静的契約・高速単体テスト (Fast Unit & Static Typecheck)
- **所要時間目標**: < 5秒
- **実行内容**:
  - `tsc -b --noEmit` によるTypeScript型検査（Zero Type Errors）。
  - 各カードのレンダリング属性、CSSクラステスト（`h-[320px]`, `overflow-hidden`, `line-clamp-2`, `truncate`）。
  - Base Modelフォーマットロジックの単体検証。

### 3.2 Tier 2: 統合テスト & コンポーネント挙動検証 (Integration & Interactions)
- **所要時間目標**: < 10秒
- **実行環境**: jsdom（CPU/RAMのみ、Zero-GPU）。
- **実行内容**:
  - `window.innerWidth = 500`（モバイル）および `1024`（デスクトップ）での条件分岐レンダリング。
  - 編集ボタン・削除ボタンのクリック時のイベント伝播抑止（詳細モーダルが誤発火しないこと）。
  - カードクリック時の詳細モーダル表示連動。
  - 検索・フィルタリング・折りたたみアクションの結合動作。

### 3.3 Tier 3: Property-Based Testing (PBT)
- **所要時間目標**: < 3秒
- **ツール**: `fast-check`
- **対象**: `target_base_model_ids` と `baseModels` からの表示文字列生成、および長文タイトルのエスケープ・省略処理。
- **検証プロパティ**:
  - 任意のモデル数（0〜50件）と任意の文字列長に対し、戻り値が常に文字列型であり、例外をスローしないこと。
  - モデル数が0件の場合は必ず `"対象モデル未設定"` を返すこと。
  - モデル数が1件の場合は単一モデル名を返すこと。
  - モデル数が複数件の場合はすべてのモデル名が ` · ` で接続されていること。

---

## 4. Red Team 境界・異常系テストケース (Boundary & Anomaly Scenarios)

1. **極小モバイル画面 (Width 360px)**:
   - 2列グリッドにおいてカード幅が約150px程度になる極小環境でも、外形高320pxが維持され、タイトル・説明・モデル名がカード外にはみ出さないこと。
2. **極端な長文テキスト (Extreme String Length)**:
   - タイトル・説明文に空白のない1000文字の英数字、特殊文字、改行コードが連続する場合でも、`break-words` により横スクロールバーやカード枠の突き破りが発生しないこと。
3. **説明文なし (Null/Empty Description)**:
   - `description` が `null` または空文字のカードで、タイトルとBase Modelがカード内に適切にレイアウトされ、ブランク領域が崩れないこと。
4. **画像なし・画像読込失敗 (No Preview / Fallback)**:
   - `thumbnail_path` が空文字または存在しない場合、`No Preview` のプレースホルダーがカード幅の中央に配置され、レイアウト寸法が崩れないこと。
5. **未分類カテゴリ (Uncategorized Data)**:
   - `category_id: null` のアイテムが「未分類」セクションに正常にまとめられ、カード内にバッジが表示されないこと。

---

## 5. テスト実行コマンド (Exact Verification Commands)

```bash
# 1. 型検査 (Gate 1 Baseline)
cd frontend && npm run typecheck

# 2. LoRAsPage受け入れテスト実行 (REQ-376フィルタ)
cd frontend && npm test -- --run src/pages/__tests__/LoRAsPage.test.tsx -t "REQ-376"

# 3. TagsPage受け入れテスト実行 (REQ-376フィルタ)
cd frontend && npm test -- --run src/pages/__tests__/TagsPage.test.tsx -t "REQ-376"

# 4. ボタン操作・インタラクション受け入れテスト実行
cd frontend && npm test -- --run src/pages/__tests__/AssetCardInteractions.test.tsx -t "REQ-376"

# 5. フロントエンド全件回帰テスト (Gate 2 Baseline)
cd frontend && npm test
```
