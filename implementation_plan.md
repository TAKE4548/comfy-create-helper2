# Implementation Plan: REQ-318 FuguMT 文脈保持型ハイブリッド和訳

Prompt Surgeon におけるプロンプト和訳処理を改修し、Danbooru タグの高速辞書引き（< 1ms）と、カンマを含む自然文の文単位 FuguMT 推論を統合した階層的ハイブリッドパイプラインを構築します。

## Proposed Changes

### Backend Subsystem

#### [LOCAL MODIFY] [backend/app/services/translation_service.py](file:///c:/Users/audih/ws/comfy-create-helper2/backend/app/services/translation_service.py)
- SENTENCE_SPLIT_PATTERN（ピリオド・改行・感嘆符・疑問符）と TAG_SPLIT_PATTERN（カンマ・読点）の分離定義。
- 既存 SPLIT_PATTERN は後方互換性エイリアスとして維持。
- process_sentence_block による文ブロック内パース・空要素フィルタ・非マッチ要素再結合の実装。
- 強度構文（(( ... :1.2))）の最外周アンパックおよび翻訳後のホワイトスペーストリム・再パック処理の統合。
- 再結合された自然文に対する文単位キャッシュキーの登録・照会最適化。

#### [LOCAL MODIFY] [backend/tests/test_translation_proxy.py](file:///c:/Users/audih/ws/comfy-create-helper2/backend/tests/test_translation_proxy.py)
- カンマ付き自然文、ハイブリッド混在プロンプト、強度構文付き自然文、ピリオド複数文、末尾ピリオドなし、連続カンマサニタイズに関する新規単体テストケースの追加。
- 既存テストの全件回帰検証。

### Documentation / SSoT

#### [LOCAL MODIFY] [docs/specs/SPEC_SETTINGS.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/specs/SPEC_SETTINGS.md)
- FuguMT 翻訳機能の説明にハイブリッド和訳パイプライン仕様を追記。

#### [LOCAL MODIFY] [docs/specs/SPEC_SUMMARY.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/specs/SPEC_SUMMARY.md)
- /api/translate エンドポイント機能一覧記述の更新。

#### [LOCAL NEW] [docs/design/REQ-318.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/design/REQ-318.md)
- 詳細設計ドキュメント。

#### [LOCAL NEW] [docs/design/REQ-318-test-plan.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/design/REQ-318-test-plan.md)
- 実行可能テスト計画書。

#### [LOCAL NEW] [docs/backlog/task/active/REQ-318-T1.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/backlog/task/active/REQ-318-T1.md)
#### [LOCAL NEW] [docs/backlog/task/active/REQ-318-T2.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/backlog/task/active/REQ-318-T2.md)
#### [LOCAL NEW] [docs/backlog/task/active/REQ-318-T3.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/backlog/task/active/REQ-318-T3.md)
#### [LOCAL NEW] [docs/backlog/task/active/REQ-318-T4.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/backlog/task/active/REQ-318-T4.md)
- 密閉コンテキスト付き物理 Task Card。

---

## Task Dependency & Parallel Execution Plan

`mermaid
graph TD
    T1[REQ-318-T1: 文境界・タグ分離と再結合ロジック]
    T2[REQ-318-T2: 強度構文保護・再パックとキャッシュ]
    T3[REQ-318-T3: 単体テスト作成と回帰検証]
    T4[REQ-318-T4: 仕様書 SSoT の同期・更新]

    T1 --> T2
    T2 --> T3
    T3 --> T4
`

- **依存関係**:
  - T1 が基底の分割・再結合ロジックを実装。
  - T2 が T1 の基盤の上に強度構文とキャッシュ処理を拡張。
  - T3 が T1, T2 の実装に対して包括的単体テストを実施。
  - T4 が検証完了後にドキュメントを同期。
- **並列性について**:
  - バックエンド同一ファイル（	ranslation_service.py）への段階的機能追加およびテスト・ドキュメント更新であるため、直列パイプライン（T1 → T2 → T3 → T4）として競合なく安全に進行します。

---

## Verification Plan

### Automated Tests
1. **Gate 1 (Typecheck)**:
   `ash
   backend\\.venv\\Scripts\\python -m mypy backend/app/services/translation_service.py
   `
2. **Gate 2 (Unit Tests)**:
   `ash
   backend\\.venv\\Scripts\\python -m pytest backend/tests/test_translation_proxy.py -v
   `
3. **Gate 3 (Integration & Red Teaming)**:
   - 全 AC-1 〜 AC-7 シナリオのパス確認。
   - 連続カンマ・空チャンク、特殊構文（LoRA等）の境界値確認。

---

## Trade-off Disclosure

1. **キャッシュキーの文単位化と粒度**:
   - カンマ付き自然文はカンマごとではなく文全体でキャッシュされます。文全体の一致時には最高精度の文脈翻訳が即時返却されますが、文の一部のみが一致した場合のキャッシュ再利用性は低下します。自然言語としての係り受け品質を優先したトレードオフです。
2. **辞書未登録タグの推論レイテンシ**:
   - Danbooru 辞書に未登録の未知タグは自然文として FuguMT 推論に送られます。辞書ヒット時（< 1ms）に比べてわずかな推論時間（20-30ms）が発生しますが、訳抜けを防ぐための意図的なフォールバックです。
