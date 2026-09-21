# REQ-280: 実行可能テスト計画書 (Executable Test Plan)

- **PBI**: REQ-280
- **改訂日**: 2026-09-20
- **作成者**: Architect / QA
- **ステータス**: テスト計画策定完了

---

## 1. 検証ゲート概要 (3-Gate Baseline)

### Gate 1: 静的解析・型チェック
- **コマンド**: `npm run typecheck` または `npx tsc -p tsconfig.app.json --noEmit` (frontend ディレクトリ内)
- **判定基準**: 0 errors

### Gate 2: フルテストスイート自動ディスカバリ実行
- **コマンド**: `npm test` (frontend ディレクトリ内)
- **対象**: `usePresetState.test.ts`, `useGenerateAction.test.ts`, `multiSetSlice.test.ts` を含む全テストスイート
- **判定基準**: 0 failures (全テスト PASS)

### Gate 3: 結合シナリオ & Red Teaming (Scenario & Red Teaming)
- **判定基準**:
  - **シナリオ 1 (In-flight 直列化)**: オートセーブ通信中に連続でパラメータ変更が発生しても、二重送信による 409 Conflict が発生せず、完了後に最新スナップショットが1回だけ送信されて最新値で保存されること。
  - **シナリオ 2 (キー順序非依存)**: オブジェクトキー順序が入れ替わった場合でも `isRecordEqual` / `isStateEqual` が等価と判定され、偽の `isDirty` が残留しないこと。
  - **シナリオ 3 (ポーリング非依存タイマー)**: 5秒ごとの定期ポーリングで `presets` の参照が変わっても、実行中のオートセーブタイマーが不意にクリア・延命されず、入力停止後1秒で保存がトリガーされること。
  - **Red Team テスト (真の他端末更新)**: 他端末によってサーバー側で本当にプリセットが更新され、かつ手元に未保存編集がある場合、正常に 409 Conflict または競合解決モーダルが表示され、更新の上書きまたは破棄を選択できること。

---

## 2. 機械的検証コード仕様 (Vitest テストケース定義)

`frontend/src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts` に以下の新規テストブロックを追加する：

```typescript
describe('REQ-280: OCC false-conflict root causes and autosave debounce fix', () => {
  it('Scenario 1: In-flight queue serializes rapid saves without triggering 409 conflict', async () => {
    // 1回目の mutate 中に2回目の mutate 要求が発生した場合、直列化されて最新値が送られること
  })

  it('Scenario 2: isRecordEqual handles different key orders without staying dirty', () => {
    // { a: '1', b: '2' } と { b: '2', a: '1' } が等価と判定されること
  })

  it('Scenario 3: background preset refetch does not cancel or delay pending autosave timer', async () => {
    // 定期ポーリングによる presets 更新が発生してもタイマーが延命されず1秒後に保存されること
  })
})
```
