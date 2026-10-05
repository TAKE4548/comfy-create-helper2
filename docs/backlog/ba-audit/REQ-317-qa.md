# REQ-317 ローカルモデルQA監査

- 実施日: 2026-10-05（Asia/Tokyo）
- 対象: `docs/design/REQ-317-test-plan.md`
- コマンド: `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py qa-audit docs/design/REQ-317-test-plan.md`
- 実行環境: ソケット制限回避のためsandbox外で実行。
- 実行結果: exit 0、モデル回答取得済み。**指摘あり（ISSUES_DETECTED）**。コード実装全体の監査PASSを意味しない。
- モデル: qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored、9.0B / Q6_K / reasoning。
- ComfyUIジョブ完了・VRAM解放待ちを経て監査を実行。生成ジョブを中断していない。
- 終了直後に `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload` を実行、exit 0。全モデル解放・VRAM解放をツールが報告。GPU全体の使用量を別途計測した結果ではない。

## モデル回答（原文）

### 指摘への対応（2026-10-05）

ユーザー指示「1と2だけ対応、3のブラウザテストは手動前提」に基づき、試験計画を更新した。

1. 説明表示を具体化: SUMMARY/tabIndex/説明本文に含む必須文字列を列挙し、ラベルとfixture値の一致、重複の不在を明示。既存テストと手動操作確認の証拠を区別する。
2. コマンドを明確化: 作業ディレクトリ・Vitest/jsdom環境・exit 0/failed 0の条件を記載し、全件試験を `npx vitest run` に統一。存在しないnpm scriptは追加しない。
3. 手動方針: 実ブラウザ確認は手動テストとし、環境・期待値・観測値・証拠を記録する手順を記載。自動ブラウザrunnerは追加しない。

文書変更のみ。アプリの変更・テスト再実行・ローカル監査再実行は行っていない。未実施の手動確認は未検証のまま。

原文の提案は自動採用していない。既存文書・package.jsonとの照合結果は次のとおり。

- 判定条件をより具体化する指摘はテスト計画の改善提案として記録。実装の不具合が検出されたことを意味しない。
- `npm test` はpackage.jsonで `vitest run` に対応し、既存コマンドは具体的に実行可能。モデル提案の `test:unit` / `test:e2e` / `test:ci` は存在しないため、そのまま置き換えない。
- VitestのE2E-like試験と実ブラウザ検証はwalkthroughで既に区別済み。実ブラウザの未検証範囲は引き続き残る。
- モデル例のID大小比較は画像IDが連番であることを前提とし、実際のtimestamp順の要件と一致しない。`lastSuccessRecord` や `record.score` は既存契約の根拠ではないため採用しない。
- unload結果を監査PASSと区別する記述は証拠の限界を示すもの。モデルの主観的注釈という評価を理由に削除しない。
- 回答中の70%・65%はモデルの自己評価であり、実測された適合率ではない。
- 総合検証判定はINCONCLUSIVEを維持。前回のBA監査は今回のQA監査とは別で、BA未判定の記録を上書きしない。

[Model Auto-Router] Successfully loaded 'qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored'.
<!-- [LLM Audit Trace: Action=qa-audit | Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored | Domain=reasoning | Params=9.0B | Quant=Q6_K] -->
# 監査報告書：REQ-317 試験計画の機械的実行可能性

## 総括評価

| 項目 | 評価 | 詳細 |
|------|------|------|
| コマンド具体性 | ⚠️ 一部曖昧 | `npm test` と `npx vitest run` が混在 |
| 判定基準 | ✅ 比較的良好 | AC番号と期待結果が明確 |
| AI逃避余地 | ⚠️ 中程度 | 「説明に到達できる」など主観的表現あり |

---

## 詳細監査

### 1. 自動試験（実装後に実行）

#### 問題点：

```diff
- AC: "0/29/30/200件、同ID更新、破損値、timestamp欠落の各条件で"
+ AC: 具体的な入力データ例と期待される出力形式を定義不足
```

**AI逃避リスク**: 「説明に到達できる」「参照できる」などの表現は、AIが「論理的に考えている」と主張する余地を残す。

#### 修正推奨：
```typescript
// 曖昧な表現 → 具体的
"最新30件を保持する"
→ "配列長 === 30 && 最古ID < 最新ID - 29"
```

---

### 2. コマンド具体性

#### 問題点：

| コマンド | 問題 |
|----------|------|
| `npm test` | Vitest環境が明示されていない（開発/本番？） |
| `npx vitest run src/test/e2e_req317_storage.test.tsx` | E2Eテストは通常Playwright/Puppeteerで、Vitest単体では不十分 |

#### 修正推奨：
```bash
# 明確化
cd frontend && npm run test:unit
npm run test:e2e -- src/test/e2e_req317_storage.test.tsx
```

---

### 3. 結合・ブラウザシナリオ

#### AI逃避余地チェック：

| AC | 曖昧点 | 具体化案 |
|----|--------|----------|
| "生成が継続し" | 継続の定義（エラーリトライ？スキップ？） | `retryCount <= 3 && totalGenerated >= expected` |
| "成功側の記録を参照できる" | 「参照」の判定基準不明 | `localStorage.getItem('lastSuccessRecord') !== null` |

---

### 4. 境界値・異常系

#### 問題点：

```diff
- "正常な新しい記録を優先し、部分使用量を正常値として表示しないこと。"
+ 「優先」のアルゴリズム定義なし → AIが「直感的に判断する」と主張可能
```

**AI逃避対策**:
```typescript
// 例：優先順位ロジックを明示
function prioritizeRecord(record) {
  if (!isValidTimestamp(record.timestamp)) return -1;
  if (record.id === duplicateId) return 0;
  return record.score || 0;
}
```

---

### 5. 証拠・制約

#### 重大な問題：

> "unload結果は監査PASSの証拠ではない"

この文は**テスト計画ではなく、監査者の主観的注釈**。AIが「自分も同様の判断をする」と模倣する余地がある。

---

## 監査チェックリスト（AI逃避防止用）

```
□ 各ACに数値的/論理的判定関数が定義されているか？
□ コマンドが環境依存なく再現可能か？
□ 「確認する」「表示できる」などの主観動詞は具体化されたか？
□ AIが「脳内シミュレーションで十分」と主張できないレベルの厳密さか？
```

---

## 最終判定

| 項目 | 結果 |
|------|------|
| **機械的実行可能性** | ⚠️ 70%（一部手動介入が必要） |
| **AI逃避防止度** | ⚠️ 65%（主観的表現が残る） |

### 推奨アクション：
1. 「説明に到達できる」→「`explaination.length > 0 && explanation.includes('...')`」
2. `npm test` → 環境を明示（`npm run test:ci` など）
3. E2Eテストのrunnerを統一（Playwright推奨）
