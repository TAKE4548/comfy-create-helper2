# REQ-303 Walkthrough (Japanese Content Generated from Sources)

## 1. Overview / Summary
Animaモードにおけるピリオド区切りタグチップ分割とプロンプト結合制御

- **Type**: enhancement
- **Status**: in-progress
- **Current step**: none
- **Priority**: P2
- **UX Classification**:
  - **Interaction Design**: タグ入力欄（TagInput）における `.` 入力およびテキストペースト時のトークン分割・確定挙動の自然言語対応
  - **Information Design**: チップ列から送信プロンプト文字列への変換（`chipsToString`）における区切り記号（`. ` / `, `）の動的判定・結合制御
  - **Visual**: 末尾ピリオドを省略・欠落させないタグチップ内ラベル表示
- **Surface**:
  - 生成画面のプロンプト欄（タグチップエディタ）において、Animaモード（自然言語/センテンス指向プロンプト）使用時は英文や自然言語の文（ピリオド終わりの文）を扱うことが多いが、現状は `,`（カンマ）のみが区切り判定となっているため、ピリオド終わりの文をタグチップとして分割・整理しづらい。
  - さらに、現在のプロンプト送信（平文変換）処理では全チップ間が一律に `, ` で結合されるため、ピリオド付きの文の後に `, ` が付与され（例: `1girl, solo., red dress.`）、自然言語プロンプトとして不自然な構文になってしまう。
  - Animaモードではピリオド `.` も区切りとみなしつつ、ピリオド自体は前のタグの末尾に残したままチップ化し、送信プロンプト生成時は直前がピリオド区切りの場合はカンマを付けず半角スペースのみで後続と結合したい。
- **Root Cause**:
  - **Interaction Design (自然言語入力とタグメタファーの不整合)**:
    - タグエディタの入力確定キーおよびパース境界がカンマ `,` に固定されており、Animaモードにおける自然言語センテンス単位（`.` 区切り）の入力・編集ライフサイクルに対応していない。
  - **Information Design (一律シリアライズによる構文破壊)**:
    - チップ配列から送信プロンプト文字列を再構成する結合ロジック（`chipsToString`）が `, ` の一律結合のみを想定しており、ピリオド終端トークンに対する適切な空白結合（`" "`）ロジックが欠如している。

## 2. 3-Gate Baseline Verification Results

| Gate | Name | Command | Result | Details |
| :--- | :--- | :--- | :---: | :--- |
| Gate 1 | Typecheck Baseline | npm run typecheck | PASS | 0 errors |
| Gate 2 | Full Test Suite Baseline | npm test | PASS | 96 files / 921 tests passed |
| Gate 3 | Scenario & Red Teaming | npx vitest run ... | PASS | 100% AC verified |

## 3. Acceptance Criteria (AC) Compliance Table

| AC | Given / When / Then | Target Test & Impl | Verdict |
| :--- | :--- | :--- | :---: |
| AC-1 | Given: タグチップエディタでAnimaモードが有効である<br>When: ユーザーがテキスト入力欄で `.` を入力（または末尾に `.` を含むテキストを入力・確定）した<br>Then: 直前のテキストが末尾の `.` を保持した状態で単一のタグチップとして確定・表示されること。 | Verified in tests | PASS |
| AC-2 | Given: タグチップエディタでAnimaモードが有効である<br>When: ピリオド `.` やカンマ `,` を含む複数文のテキストがペーストまたは初期値として入力された<br>Then: ピリオド区切りの部分は末尾に `.` を付けたチップとして分割され、カンマ区切りの部分はカンマを除去したチップとして分割され、かつ各チップの前後余剰空白がトリムされ空チップが生成されないこと。 | Verified in tests | PASS |
| AC-3 | Given: タグチップエディタでAnimaモードが有効である<br>When: 重み付き括弧記法 `(tag:1.2)` を含むテキストが入力・パースされた<br>Then: 括弧内のピリオドは区切り判定されず、括弧ネスト全体が1つのタグチップとして保護されること。 | Verified in tests | PASS |
| AC-4 | Given: Animaモードで作成されたピリオド終端チップと通常チップが混在している<br>When: ComfyUIへのプロンプト送信または平文変換（`chipsToString`）が実行された<br>Then: 有効チップ間で、直前のチップ末尾が `.` の場合は半角スペース `" "` のみ（例: `1girl. red dress.`）、直前のチップ末尾が `.` 以外の場合は従来通り `, `（例: `masterpiece, 1girl.`）で結合され、先頭や末尾に余計な区切り文字が付与されないこと。 | Verified in tests | PASS |
| AC-5 | Given: ピリオド終端チップの直後に無効化（`enabled: false`）されたチップが存在する<br>When: プロンプト文字列への変換が実行された<br>Then: 無効化チップは除外され、直前の有効なピリオド終端チップと次の有効チップとの間が半角スペース `" "` のみで正しく結合されること。 | Verified in tests | PASS |
| AC-6 | Given: タグチップエディタでAnimaモードが無効（通常モード）である<br>When: タグの入力、パース、およびプロンプト送信文字列への変換が行われた<br>Then: `.` は区切り文字として扱われず、全有効チップ間は従来通り `, ` で統一して結合されること。 | Verified in tests | PASS |
| AC-7 | Given: Animaモードにおいてピリオド終端チップとカンマ区切りチップを含むプロンプトが設定されている<br>When: タグチップモードからテキスト入力モード（textarea）へ切り替え、再度タグチップモードへ復帰した<br>Then: ピリオド付きタグの末尾ピリオドおよびカンマ区切りタグの構造が壊れずに相互変換されること。 | Verified in tests | PASS |

## 4. Red Teaming (Boundary & Fault Injection)

| Case | Scenario | Expected | Verdict |
| :--- | :--- | :--- | :---: |
| RT-1 | hello.... world,,  ..  ,, .  test. | 3 chips hello., world, test. | PASS |
| RT-2 | width 1.5 ratio. height 2.0 meter. | Decimal protected, 2 chips | PASS |
| RT-3 | ((tag:1.2. unfinished bracket | No crash or error | PASS |
| RT-4 | All chips disabled | Empty string return | PASS |

## 5. Local Model QA Audit & VRAM Cleanup
- Model: qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored (Domain: reasoning)
- Tool: local_model_adapter.py qa-audit
- Result: COMPLIANT
- Mandatory VRAM Release: python local_model_adapter.py unload (100% freed)

## 6. SSoT Synchronization Status
- docs/specs/SPEC_COMMON.md updated with 3-6 TagInput and 3-7 Parse Rules.
