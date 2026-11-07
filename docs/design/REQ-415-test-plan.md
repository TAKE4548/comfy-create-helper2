# REQ-415 実行可能テスト計画 (Executable Test Plan)

## 1. 自動テスト Baseline 検証 (CLI Verification 3-Gate)

### 1.1 被テスト対象の設計概要 (Under-Test Architecture Summary)
`PatternTagInput` コンポーネントは、タイトル検索パターン（`titlePatterns`）を入力・管理するReactプレゼンテーションコンポーネントである。
モバイル仮想キーボード対応として以下を実装し、全受入基準（AC-1〜AC-5）を達成する：
- **AC-1**: タップ用「追加」ボタン（`<Plus size={12} />` 付き、44×44px Hit-Slop対応）新設。タップで `addTag(inputValue)` を実行し、チップ追加および入力欄クリア。
- **AC-2**: `<input>` に `enterKeyHint="done"` を設定し、Enter押下時の `e.preventDefault()` によりフォーム送信および次項目（Role上書き）へのフォーカス誤ジャンプを完全抑止。
- **AC-3**: `<input>` に `onBlur={() => addTag(inputValue)}` を設定し、他フィールド遷移時に入力中の未確定文字列を自動確定。
- **AC-4**: `handleKeyDown` の先頭で `e.nativeEvent.isComposing || e.keyCode === 229` を検知し、日本語IME変換確定Enterでのタグ追加を抑止。変換確定後のEnterでのみ追加を許可。
- **AC-5**: 入力値が空文字または既存パターンと重複する場合、「追加」ボタンを `disabled` に設定し、重複チップの追加を防止。

### 1.2 Baseline 3-Gate 検証コマンド
- **Gate 1: 静的型チェック (Static Typecheck Baseline)**:
  - コマンド: `cd frontend; npm run typecheck`
  - 期待値: 型エラー 0 件 (Exit code 0)。`PatternTagInputProps` の型整合性および `enterKeyHint` 属性、新設ボタンの型安全性を検証。
- **Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)**:
  - コマンド: `cd frontend; npm test` (局所実行: `cd frontend; npx vitest run src/components/__tests__/PatternTagInput.test.tsx`)
  - 期待値: 全テスト PASS (Exit code 0)。AC-1〜AC-5 の全受入基準を網羅して検証。
- **Gate 3: シナリオ・境界値・Red Team 検証**:
  - コマンド: `cd frontend; npx vitest run src/components/__tests__/PatternTagInput.test.tsx -t "REQ-415"`
  - 期待値: モバイル仮想キーボード制御、IME変換確定、Blur自動確定、重複・空文字排除の全境界値テスト（RT-1〜RT-5）が PASS。

---

## 2. 階層別テスト設計 (Execution Tier & Case Hierarchy)

| 階層 (Tier) | 対象スコープ | 目的・検証内容 | 実行ランナー / ファイル |
| :--- | :--- | :--- | :--- |
| **Tier 1: Unit** | `PatternTagInput` | コンポーネント単体のProps・State・イベントハンドラ（Enter/Blur/Click/IME）・バリデーション（AC-1〜AC-5） | Vitest (jsdom) / `frontend/src/components/__tests__/PatternTagInput.test.tsx` |
| **Tier 2: Integration** | `MappingMasterEditModal` 連動 | `<form>` 内での Enter 押下時にフォーム送信や次フィールド（Role上書き）へのフォーカス移動が発生しないことの検証（AC-2） | Vitest (jsdom) / `PatternTagInput.test.tsx` (Form結合ケース) |
| **Tier 3: E2E** | モバイル実機/ブラウザ操作 | モバイル表示幅（<768px）における44pxタップ領域（Hit-Slop）の有効性と仮想キーボード `enterKeyHint="done"` 属性の確認（AC-1, AC-2） | Vitest / Jest DOM matchers |
| **Tier 4: Scenario / Red Team** | 境界値・異常系・破壊的入力 | 連続Enter連打、IME未確定中のEsc/Blur、カンマ/ダブルクォート混在文字列のペースト、極小/極大文字数入力（AC-1〜AC-5境界） | Vitest (jsdom) / Red Team cases |

---

## 3. 受入基準 (AC) 対照テストマトリクス

すべてのテストケースは `@case('[REQ-415/AC-x]')` 形式の安定したランナーIDおよびレイヤータグをテスト名に明記して実装する。
本マトリクスは、PBI REQ-415 におけるすべての受入基準（AC-1〜AC-5）に対するテスト網羅性を保証する：

- **AC-1 (追加ボタンによるチップ追加)**: 入力欄右側の「追加」ボタン（`<Plus size={12} />` 付き、44×44px Hit-Slop対応）をクリックまたはタップした際に、入力文字列が新たなパターンチップとしてリストに追加され、入力欄がクリアされることを単体テスト `[REQ-415/AC-1]` で検証する。
- **AC-2 (enterKeyHint="done" および Enter 制御)**: `<input>` 要素に `enterKeyHint="done"` 属性が付与され、Enterキー押下時に `e.preventDefault()` が呼ばれることで、親モーダルの `<form>` 送信や次項目（Roleフィールド等）へのフォーカス誤移動が発生せずにパターンが追加されることを統合テスト `[REQ-415/AC-2]` で検証する。
- **AC-3 (Blur 自動確定)**: 文字列を入力した後にEnterやボタンを押さずに入力欄外をタップまたは別要素へフォーカス移動（Blurイベント発火）した際、未確定の有効文字列が自動的にパターンチップとして確定・追加されることを単体テスト `[REQ-415/AC-3]` で検証する。
- **AC-4 (日本語 IME 変換中の Enter 誤追加防止)**: 日本語入力のIME変換中（`e.nativeEvent.isComposing === true` または `keyCode === 229`）にEnterキーが押下された場合、パターン追加処理が厳格にスキップされ、確定後のEnterでのみパターンが追加されることを単体テスト `[REQ-415/AC-4]` で検証する。
- **AC-5 (入力欄空・重複時の追加ボタン非活性化および重複防止)**: 入力欄が空文字（トリム後空）または既存パターンとの完全重複（大文字小文字無視）である場合に「追加」ボタンが非活性（`disabled`）となり、ボタン押下やEnter押下による重複登録が抑止されることを単体テスト `[REQ-415/AC-5]` で検証する。

| AC ID | テストファイル | ランナーケースID / テストケース名 | レイヤー | 検証コマンド |
| :--- | :--- | :--- | :--- | :--- |
| `AC-1` | `frontend/src/components/__tests__/PatternTagInput.test.tsx` | `[REQ-415/AC-1] adds pattern on tap/click of "追加" button and clears input` | `unit` | `npm --prefix frontend test -- src/components/__tests__/PatternTagInput.test.tsx -t "REQ-415/AC-1"` |
| `AC-2` | `frontend/src/components/__tests__/PatternTagInput.test.tsx` | `[REQ-415/AC-2] has enterKeyHint="done" and adds pattern on Enter without form submission/focus loss` | `integration` | `npm --prefix frontend test -- src/components/__tests__/PatternTagInput.test.tsx -t "REQ-415/AC-2"` |
| `AC-3` | `frontend/src/components/__tests__/PatternTagInput.test.tsx` | `[REQ-415/AC-3] auto-commits valid text as a pattern chip on input blur` | `unit` | `npm --prefix frontend test -- src/components/__tests__/PatternTagInput.test.tsx -t "REQ-415/AC-3"` |
| `AC-4` | `frontend/src/components/__tests__/PatternTagInput.test.tsx` | `[REQ-415/AC-4] suppresses tag addition during Japanese IME composition Enter, and adds tag on Enter after composition` | `unit` | `npm --prefix frontend test -- src/components/__tests__/PatternTagInput.test.tsx -t "REQ-415/AC-4"` |
| `AC-5` | `frontend/src/components/__tests__/PatternTagInput.test.tsx` | `[REQ-415/AC-5] disables "追加" button when input is empty or duplicate, and prevents duplicate tag addition` | `unit` | `npm --prefix frontend test -- src/components/__tests__/PatternTagInput.test.tsx -t "REQ-415/AC-5"` |

---

## 4. Seam Map 設計 [W-DD-SEAM]

1. **Integrated (本物のコード)**:
   - `PatternTagInput.tsx`: 実コンポーネントコードを実行。`useState`, `useRef`, `handleKeyDown`, `onBlur`, `addTag`, ボタンクリックの全インタラクションを本番コードのまま結合実行する。
     - 「追加」ボタンタップで `addTag(inputValue)` を実行しパターンチップを追加（`AC-1`）。
     - `<input>` に `enterKeyHint="done"` を設定し、Enter押下時の `preventDefault()` によりフォーカス遷移を抑止（`AC-2`）。
     - フォーカス離脱（Blur）時に未追加文字列を自動コミット（`AC-3`）。
     - IME変換中（`isComposing` / `keyCode 229`）のEnterでは追加を抑止（`AC-4`）。
     - 空文字・重複時はボタンを非活性（disabled）にし、重複追加を防止（`AC-5`）。
2. **Severed (切断対象)**:
   - 外部ネットワーク通信（HTTP / WebSocket）および DB 永続化層（完全ゼロI/O）。
3. **Mock Level**:
   - DOMイベント層。`@testing-library/react` の `fireEvent` を用いてユーザー操作（change, keyDown, blur, click）をシミュレートする。内部ロジックやヘルパーのモックは厳禁。
4. **PBT (Property-Based Testing)**:
   - 不採用。決定論的境界テストで全ACを網羅。
5. **Fault Injection**:
   - 異常系・極値ケースを網羅（Red Teaming 参照）。

---

## 5. シナリオ検証 & Red Teaming (正常系・異常系・境界値) [Gate 3 Baseline]

### シナリオ RT-1 (AC-1 / AC-5 境界): 連続Enter・連打テスト
- **Given**: 文字列 `"ksampler"` を入力した状態。
- **When**: Enterキーまたは「追加」ボタンを高速連打（連続呼び出し）したとき。
- **Then**: 最初の1回のみタグが追加され、2回目以降は空文字判定または重複判定により安全にスキップされること（重複追加防止）。

### シナリオ RT-2 (AC-3 / AC-4 境界): IME変換中のBlur割り込みテスト
- **Given**: 日本語IME入力中（未確定文字列が存在）の状態。
- **When**: 変換確定Enterを行わずに別フィールドへフォーカスが移動（Blur）したとき。
- **Then**: `e.target.value` に残された文字列が安全にトリムされ、有効な文字であればチップとして追加されること。

### シナリオ RT-3 (AC-5 境界): 空白のみ・記号のみ入力テスト
- **Given**: スペース `"   "` やタブ文字のみが入力された状態。
- **When**: 「追加」ボタンをクリック、またはEnter押下、またはBlurしたとき。
- **Then**: タグは追加されず（`onChange` 呼出なし）、入力欄のみクリアされること。

### シナリオ RT-4 (AC-1 / AC-5 統合): 重複・カンマ混在文字列のペースト
- **Given**: 既存パターン `['positive']` が存在する状態。
- **When**: クリップボードから `"positive, sampler, positive"` をペーストしたとき。
- **Then**: 重複が除去され、`['positive', 'sampler']` のみが設定されること。

### シナリオ RT-5 (AC-1〜AC-5 全体保護): Disabled状態の完全保護
- **Given**: `disabled={true}` でコンポーネントが描画された状態。
- **When**: 「追加」ボタンのクリック、Enter押下、Blurのいずれのイベントを発火させたとき。
- **Then**: `onChange` が一切発火せず、チップ一覧が不変に保たれること。

---

## 6. リスク評価 & Full-Suite Fallback トリガー分析

### 6.1 リスク分類 (Risk Classification)
- **判定**: `low` (UI / Frontend 単一コンポーネントおよびローカルイベント処理)
- **根拠**:
  - バックエンドの DB スキーマ、マイグレーション、API エンドポイント契約、認証・権限、共有インフラへの変更を一切含まない。
  - 変更はフロントエンドの 1 つの UI コンポーネント（`PatternTagInput.tsx`）およびその単体テスト（`PatternTagInput.test.tsx`）に厳格に局所化されている。
  - 受入基準 AC-1 〜 AC-5 のすべての検証がフロントエンド単体テスト環境（Vitest / jsdom）で完結する：
    - `AC-1`: 「追加」ボタンタップ時の入力欄クリアおよびチップ追加検証（単体テスト）
    - `AC-2`: `enterKeyHint="done"` 付与および Enter 押下時のフォーム送信・フォーカス遷移抑止検証（統合テスト）
    - `AC-3`: 入力中文字列の onBlur 自動コミット検証（単体テスト）
    - `AC-4`: 日本語 IME 変換中の Enter 押下による誤追加抑制検証（単体テスト）
    - `AC-5`: 空文字・重複文字列時の追加ボタン非活性化および重複追加抑止検証（単体テスト）

### 6.2 Full-Suite Fallback トリガー (強制全スイート実行条件)
以下の条件が 1 つでも発生した場合、直ちにフォールバックが発動し、フロントエンドおよびバックエンドの全テストスイート（`Gate 2: Full Suite`）を逐次再実行する。これにより、AC-1（ボタン追加）、AC-2（Enter制御）、AC-3（Blur自動確定）、AC-4（IMEガード）、AC-5（重複・空文字排除）の受入基準が予期せぬ回帰やモック汚染なく確実に保護・検証される：
1. バックエンドコード、SQL、またはマイグレーションファイルへの偶発的編集が検知された場合。
2. `package.json` や `tsconfig.json` 等のインフラ・依存関係設定が変更された場合。
3. テスト実行時にコレクションの不一致、想定外のスキップ（skip）、または型チェックエラーが発生した場合。
4. 単体テストにおいて内部ロジックのモック汚染や偽陽性アサーションが検出された場合（例：AC-1のタップ追加やAC-4のIME抑制ロジックが正常に検証されていない等）。
5. 各 AC テストケース（AC-1〜AC-5）の検証結果にリグレッションまたは不整合が認められた場合。

### 6.3 ツール主導監査計画 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_HELPERS}\local_model_adapter.py --context-length 32768 qa-audit --audit-kind qa_evidence --audit-package <PKG_JSON> docs/design/REQ-415-test-plan.md`
- **アンロード**: `python ${GLOBAL_HELPERS}\local_model_adapter.py unload`
