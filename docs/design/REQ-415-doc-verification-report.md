# REQ-415 文書受入検証レポート (doc-verify)

- **PBI**: [REQ-415](docs/backlog/pbi/active/REQ-415.md) (ノードマッピング編集時のモバイルにおけるタイトル検索パターン追加不能不具合)
- **タスク**: REQ-415-T2 (タイトル検索パターンのモバイル仮想キーボード対応およびタップ追加導線に関するSSoT仕様書の同期)
- **レビュー担当**: doc-reviewer (独立文書検証。実装者の自己確認ではない)
- **対象候補 (Reviewed Candidate)**:
  - `docs/specs/SPEC_COMMON.md` (sha256: `8e82bbde4c27f92a93050a9c9b5c71d76885ab65028599dcf05ba79fc5fe4230`)
  - `docs/design/REQ-340.md` (sha256: `709b26631a633e66086dc571131de32dfcd6d4c6b4ede1e03998e7cff3e8ad4e`)
- **参照文書**:
  - PBI: `docs/backlog/pbi/active/REQ-415.md`
  - 詳細設計書: `docs/design/REQ-415.md`
  - 実行可能テスト計画: `docs/design/REQ-415-test-plan.md`
  - タスクカード: `docs/backlog/task/active/REQ-415-T2.md`
- **整合確認コード (Read-Only)**:
  - `frontend/src/components/PatternTagInput.tsx`
  - `frontend/src/components/__tests__/PatternTagInput.test.tsx`
- **対象文書の保全**: 本レビュー中、対象候補ファイル（`SPEC_COMMON.md` および `REQ-340.md`）の編集・修正は一切行っておらず、読み取り専用で独立検証を実施した。

---

## 1. 総合判定

文書総合判定: **PASS**

### 判定要約
PBI REQ-415 における受入基準 AC-1〜AC-5 に対し、対象文書（`docs/specs/SPEC_COMMON.md` および `docs/design/REQ-340.md`）へ過不足なく正確な仕様契約が同期されていることを確認した。
デスクトップ向けの既存挙動（コピー、ペースト、インライン編集等）は完全に保全されており、MUI-10の共通モバイル規約・Preset 3（Forms & Controls）との用語・契約の整合性も確保されている。
また、実装コードおよび単体テストとのセマンティクス上の乖離や矛盾、未解決の欠陥は認められない。

---

## 2. 受入基準 (AC) 別 検証結果

| AC ID | 受入基準の概要 | 判定 | 候補文書内の具体的記述根拠 / 検証限界 |
| :--- | :--- | :---: | :--- |
| **AC-1** | 文字列入力後に「追加」ボタンタップでパターンチップ追加＆入力欄クリア | **PASS** | **【根拠】**<br>・`REQ-340.md §3.2`: 「入力欄右側に「追加」ボタン（`<Plus size={12} />` 付き、`type="button"`）を常設。最小44×44pxの有効タップ領域（Hit-Slop: `relative before:absolute before:-inset-2 touch-manipulation`）を確保（MUI-06/MUI-10準拠）。」と明記。<br>・`SPEC_COMMON.md §1-5-3 / §1-6-3`: タップ確定用「追加」ボタン（44×44px Hit-Slop）の設置義務を規定。<br>**【限界】** 文書上の仕様定義の完全性を確認。実ブラウザでの描画検証はTier 3に委譲。 |
| **AC-2** | `enterKeyHint="done"` 設定とEnter押下でのタグ追加（直下フォーカス移動防止） | **PASS** | **【根拠】**<br>・`REQ-340.md §3.2`: 「`<input>` に `enterKeyHint="done"` を付与し、仮想キーボード上で確定操作を表示。Enter押下時に `e.preventDefault()` を実行することで、親フォーム送信や次フィールド（Role上書き等）へのフォーカス誤ジャンプを防止し、パターンチップを追加。」と明記。<br>・`SPEC_COMMON.md §1-5-3 / §1-6-3`: 仮想キーボードEnterによるフォーム送信・次フィールド誤遷移防止（`enterKeyHint="done"` と `preventDefault()`）を必須化。<br>**【限界】** 仮想キーボードのネイティブ挙動はjsdom/単体テストのイベント契約に基づき確認。 |
| **AC-3** | 文字列入力中のフォーカス離脱（Blur）でパターンチップ自動追加 | **PASS** | **【根拠】**<br>・`REQ-340.md §3.2`: 「入力欄に未確定文字列を残したまま他要素へのタップや画面スクロールによりフォーカスが外れた際、自動的に `addTag` を実行してチップ化。明示的な「追加」ボタンタップ時のBlurとの競合も、空文字チェックにより二重追加・不整合なく安全にハンドリング。」と明記。<br>・`SPEC_COMMON.md §1-5-3 / §1-6-3`: 入力中に別フィールドへ遷移した場合でも入力を破棄しない `onBlur` 自動確定フォールバックの義務を規定。<br>**【限界】** 競合回避の冪等性ロジック（空文字チェック）が文書に明記されていることを確認。 |
| **AC-4** | 日本語IME入力中（isComposing）のEnterでは追加抑止、確定後Enterで追加 | **PASS** | **【根拠】**<br>・`REQ-340.md §3.2`: 「`handleKeyDown` において `e.nativeEvent.isComposing || e.keyCode === 229` の判定を行い、日本語変換確定のEnter押下による誤追加を抑止。確定後の再Enterでのみ追加を実行。」と明記。<br>・`SPEC_COMMON.md §1-5-3 / §1-6-3`: 日本語IMEの変換確定Enter（`isComposing` / `keyCode === 229`）での誤追加防止ガードを明記。<br>**【限界】** Web標準イベント属性およびAndroid特有の229キーコード双方への対応が文書化されていることを確認。 |
| **AC-5** | 入力欄空文字または重複時に「追加」ボタン非活性（disabled）、重複追加防止 | **PASS** | **【根拠】**<br>・`REQ-340.md §3.2`: 「入力欄が空文字（トリム後）または既存チップと重複している場合は `disabled` 状態とし、重複・空登録を防止。」と明記。<br>・`SPEC_COMMON.md §1-6-3`: 「空文字・重複時は非活性（`disabled`）とする」と明記。<br>**【限界】** 空白のみ（トリム後空）および既存パターンの大文字小文字/トリム重複の排除規定を確認。 |

---

## 3. 規範性・セマンティクス・適用範囲の独立監査

### 3.1 読者・目的・責務の明確さ
- `SPEC_COMMON.md`: 全画面・共通コンポーネントにおけるモバイルUI設計規範（SSoT）としての役割を果たしており、Preset 3（フォーム・コントロール）および MUI-10（ジェスチャー・タッチ操作代替経路）への追記が既存の体系と自然に調和している。
- `REQ-340.md`: ノードマッピング編集機能の詳細設計書（SSoT）として、`PatternTagInput` の振る舞い契約が明確に追記され、後続の開発者や保守担当者が迷う余地がない。

### 3.2 用語・参照の整合性
- Hit-Slop の定義クラス（`relative before:absolute before:-inset-2 touch-manipulation`）が SPEC_COMMON §1-5-3 の既存規約と完全に一致。
- 44×44px 最小タップ領域（MUI-06/MUI-10）、`enterKeyHint="done"`、日本語IME判定式（`e.nativeEvent.isComposing || e.keyCode === 229`）の表記揺れがない。
- MUI-10 規則一覧表における「導入前（PatternTagInputはREQ-415で導入済み）」のステータス管理表記が、1-6-1節の運用規約（一部完了時の補足記述）に厳格に準拠している。

### 3.3 既存挙動の保全性 (Preservation Cases)
- `REQ-340.md §3.2` におけるデスクトップ向け操作（パターンをコピー、カンマ・改行・タブ等でのペースト・一括マージ、ダブルクリック/編集アイコンによるインライン編集・Escape破棄）が一切削られず、そのまま維持されている。
- `SPEC_COMMON.md` における既存の長押し起点操作（選択モード開始や並べ替え）に対する例外規定がそのまま維持され、本改修によって他の画面規約が侵食されていない。

### 3.4 シナリオ・境界値・異常系の検討 (Reasoned Normal/Boundary/Failure Analysis)
- **RT-1 (連続Enter・連打)**: ボタンタップおよびEnter押下後に `setInputValue('')` により入力欄がクリアされ、二打目以降は空文字ガードが働くため重複追加は発生しないことが文書から導出可能。
- **RT-2 (IME変換中Blur割り込み)**: IME変換中に確定せずBlurが発生した場合、`onBlur` の `addTag(inputValue)` が走り、トリム後の有効文字であれば安全にコミットされることが規定されている。
- **RT-3 (空白のみ・記号のみ)**: トリム後に空文字となる入力は `disabled` かつ `addTag` 内で破棄される設計が両文書に記述されている。
- **RT-4 (重複・カンマ混在のペースト)**: 既存のペースト処理フロー（カンマ分割・トリム・重複排除）がデスクトップ・モバイル双方で機能する記述が維持されている。
- **RT-5 (Disabled状態の保護)**: コンポーネント全体の `disabled` 時にボタンが非活性となることが明記されている。

---

## 4. 実行可能ベースライン・整合検証の記録 (Reference Check)

本タスクは `docs-only` の文書変更であるが、設計および文書記述が実際のコード実装と厳密に合致していることを検証するため、関連する単体テストおよび型チェックを実行・確認した：

1. **Gate 1 静的型チェック**:
   - コマンド: `npm --prefix frontend run typecheck`
   - 結果: Exit code 0 (型エラー 0 件)
2. **Gate 2 単体テスト**:
   - コマンド: `npm --prefix frontend test -- src/components/__tests__/PatternTagInput.test.tsx`
   - 結果: 11 passed (11 tests), Exit code 0
   - テスト内訳: AC-1（追加ボタン）、AC-2（enterKeyHint/Enter制御）、AC-3（onBlur確定）、AC-4（IME変換ガード）、AC-5（重複・空文字非活性）、および既存のインライン編集・ペーストテスト全件PASS。

---

## 5. 検出欠陥・修正要否

- **重大な欠陥**: なし (0件)
- **軽微な指摘 / 表記不整合**: なし (0件)
- **修正要否**: なし。現ドラフトのままで正本承認可能。

---

## 6. Audit-Cache 結果及び制約事項

- **Audit-Cache Outcome**: `none` (文書受入検証におけるキャッシュ参照および生成はなし)
- **検証限界**:
  - 本レポートは `docs-only` スコープ（REQ-415-T2）に対する独立文書受入検証であり、コード成果物の正式なコミット権限やPBIクローズ権限を行使するものではない（コーディネーターが総合判断）。
  - 実機iOS Safari / Android Chrome上でのネイティブ仮想キーボードレンダリング挙動は、仕様書およびjsdom単体テストの合致性をもって確認した。