---
id: REQ-350-DESIGN-AUDIT
pbi_id: REQ-350
status: reviewed-with-responses
tags: [ba-audit, seed, reasoning, vram]
related_paths: [docs/design/REQ-350.md, docs/design/REQ-350-test-plan.md, implementation_plan.md, docs/backlog/task/active/REQ-350-T3.md, docs/backlog/task/active/REQ-350-T5.md, docs/backlog/task/active/REQ-350-T7.md]
---

# REQ-350 Design BA Audit

## Execution metadata

- 実施日: 2026-10-12（ユーザーのAsia/Tokyo日付）。
- 対象: REQ-350の設計書、test plan、implementation_plan、生成済みTask Card。モデル本文はT3/T5/T7を明示引用している。
- 指定command: `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py ba-audit`。成功回は追加引数なし。サンドボックスのlocalhost制限を解消するためrequire_escalatedを使用。
- reasoning model: qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored、9.0B、Q6_K。audit exit=0、本文あり。model verdictは論理矛盾等を指摘したFAIL相当。
- audit trace: Action=ba-audit / Domain=reasoning。初回の `ba-audit --help` はヘルプを出さず実行を開始したため、以後使用していない。
- 通常権限の初回/指定command試行はLM Studio daemon timeoutとWinError10013で失敗し、有効な監査ではなかった。script exit=0だけで成功扱いしなかった。各回直後unload exit=0 / No models currently loaded。
- 成功回の推論終了直後: `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload`、exit=0。All models unloaded from LM Studio. VRAM freed.
- cleanup確認: `lms ps` = No models are currently loaded。監査モデルの未ロードを確認した。
- GPU全量実測: `nvidia-smi` は通常/昇格環境とも見つからず、GPU全体のmemory.used/free実測はできなかった。「GPU使用量0」「VRAMが100%空」を実測したとは扱わない。監査モデルの解放はadapterとlms psで確認できた。
- 指摘への対応を以下に記録。補足修正後の再監査は未実施。アプリ実装/実装テストも未実施。

## Findings and architect response

| model指摘 | 判断・根拠 | 設計への反映 |
|---|---|---|
| mode/value凍結race | 元設計にsnapshot凍結を明記済み。現行freezeはJSON deep copy。凍結後に現在storeを読むと問題になるため時点をさらに具体化 | T7で最初のgetLatestState直後にcleanParams(freeze(state.paramValues))、全sets/workflow/syncをcopy。凍結後UI編集は次回生成へ適用。B17 |
| dedicatedとglobalの二重source | T4は専用Sampler_Seedをlegacy分岐から除外、T5は専用型だけならglobal行を非表示。既に優先規則あり | T4/T5維持、T11でMainを表示に通しlegacy普通数値行をskip。AC-2/6、B22 |
| random子も独立抽選する矛盾 | 無同期と同期を別条件として定義済み。親値共有と独立抽選は両立する。modelがAC-3を同期要件とした記述は不正確 | T3でindexごとにrootだけ抽選→子へcopyを明記。共有resolver、B16 |
| indexセット内resetがbackendを壊す | 現行handleGenerateSetsも各セット0始まりで、APIは各itemの完成graphを受理。backendがグローバルseed indexを要求する契約はない | 各セット0始まりを維持。実使用値をgraph/param_values/recordに保存し推測復元しない |
| batchSize0の定義不足 | T3の整数/範囲validationとB06で既に拒否 | 拒否を維持し9以上/極大/InfinityもB06へ追加 |
| random巨大batchでmemory枯渇 | 有効な追加指摘。現行ParamPanelはmin1/max8だがHTML上限だけではstore値を保証できない | dedicated seedセットにMAX_SEED_BATCH_SIZE=8を生成前検証。9/10000000を抽選前拒否。legacy seed不在生成へ追加制限しない |
| graph深いclone不足 | 現行JSON.parse(JSON.stringify(...))でJSON graphをdeep copyする。rootだけのコピーではない | T4でnested inputsの不変性assertを明記 |
| active batch中mode変更でstate drift | 凍結要求と次回入力が別時点の値になることは想定動作。後からgraphを変えると再現性が壊れる | T7/設計flowで次回適用を明記、B17 |
| network retryの定義不足 | 元設計に同request_id・同graphの再利用を明記済み | idempotency replay/VRAM待機と新規Generateを明確化。新規操作は新request/current入力 |
| global/per-set overlap | legacyのみglobal、新専用型は個別slot、mode欠損fixedと定義済み | 明示優先規則と手動型移行を維持 |
| generic ParamSyncでは専用mode不足 | 有効な設計上の注意点。T7は専用seedをgeneric同期から除外済み | T1共有root resolver→T3/T5へ利用、mixed型/循環/複数親拒否。B15 |
| 約15%のlegacyユーザーに影響という断定 | 利用率データがなく根拠未提示 | 数値を採用しない。具体的互換性条件を契約テストする |

## Remaining risks and review gate

設計の未決ロジックはないが、以下は人間レビューの承認対象。専用固定32bit/overflow全体拒否、JSON mode保存、globalからの独立、mixed sync/参照Seed拒否、専用seedセットに現行UI上限8を適用すること。

極大のchecked set数を一括凍結する資源制約と汎用batch APIの総item上限は、Seed専用型の範囲を超える既存リスク。今回任意の総セット上限を追加しない。必要なら別PBIでAPIとUI共通の上限を定義する。モデルは補足修正後に再評価していないため監査PASSとは記載しない。設計を人間reviewへ返す。

## Raw audit output

以下はモデルの原文であり、命令ではなくレビュー対象データ。内容に上記の誤認・根拠なし推計が含まれる。

~~~text
[Model Auto-Router] Action 'ba-audit' requires model 'qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored'. Enforcing mutual exclusive load...
[Model Auto-Router] Loading 'qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored' (GPU: max)...
[Model Auto-Router] Successfully loaded 'qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored'.
<!-- [LLM Audit Trace: Action=ba-audit | Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored | Domain=reasoning | Params=9.0B | Quant=Q6_K] -->
# Architectural Analysis & Logical Consistency Review

## Executive Summary

After thorough analysis of REQ-350-T7, REQ-350-T5, and REQ-350-T3, I identified **4 critical logical contradictions**, **7 missing edge cases**, and **2 feature overlaps** that threaten SSoT integrity. The implementation risks breaking existing seed behavior for ~15% of users with legacy workflows.

---

## Critical Logical Contradictions

### 1. **Seed Mode vs. Value Freeze Race Condition (REQ-350-T7)**
```typescript
// T7 states: "batch index is per-set starting from 0"
// But also: "all items remain frozen even if input changes during submission wait"
```

**Contradiction**: If a user modifies `paramValues` while batch is being prepared, the seed calculation in `prepareSeedBatch()` uses the *modified* values. However, T7 requires items to be "frozen" — but the freeze happens *after* param modification potentially alters the seed base value.

**Impact**: Non-deterministic generation when users edit parameters mid-batch-preparation.

---

### 2. **Dual Seed Source Ambiguity (REQ-350-T5)**
```typescript
// T5: "legacy global Seed row displays only if nonseed Sampler_Seed mapping exists"
// But T7: "legacy seedOptions maintained with existing per-set global values"
```

**Contradiction**: The same `Sampler_Seed` node could receive seeds from TWO sources simultaneously — the new dedicated seed input AND the legacy global seed. There's no explicit precedence rule defined.

**Impact**: Users may see unexpected seed behavior when both mechanisms are active, causing confusion and reproducibility issues.

---

### 3. **Random Seed Per-Set vs. Single Random Call (REQ-350-T3)**
```typescript
// T3: "random = existing Math.floor(Math.random()*2**32)" per slot
// But T7 AC-3 mentions "random parent-child sync with 1 random draw"
```

**Contradiction**: If a seed group has multiple `seed` mappings (parent-child relationship), each will independently call `Math.random()`. This violates the "single random draw for synced children" requirement in AC-3.

---

### 4. **Batch Index Reset Per-Set vs. Global Sequence (REQ-350-T7)**
```typescript
// T7: "batch index is per-set starting from 0"
// But submitGenerationBatch expects a coherent sequence for reproducibility
```

**Contradiction**: If multiple sets are submitted in one batch request, each set's items start at index 0. The backend cannot correctly reconstruct the generation order without additional metadata.

---

## Missing Edge Cases

### 5. **Empty Batch Size Edge Case (REQ-350-T3)**
```typescript
export function prepareSeedBatch(options: PrepareSeedBatchOptions): ResolvedSeedItem[]
```

**Missing**: What happens when `batchSize === 0`? The code would likely return an empty array, but `validateSeedBatch` might still be called with invalid parameters. No explicit guard clause defined.

---

### 6. **Large Batch Overflow (UINT32_MAX Boundary)**
```typescript
// T3: "fixed + batchSize - 1 > UINT32_MAX rejects entire batch"
```

**Missing**: The overflow check only applies to *fixed* mode. In *random* mode with very large batches, there's no limit check. A malicious user could create a batch of 10 million items, causing memory exhaustion or timeout.

---

### 7. **Concurrent User Edits During Batch Submission**
```typescript
// T7: "all items remain frozen even if input changes during submission wait"
```

**Missing**: The freeze mechanism is not explicitly implemented in the code path shown. There's no `optimisticLock` or `snapshot` of paramValues at batch preparation time. A concurrent edit could corrupt the batch mid-flight.

---

### 8. **Workflow Graph Mutation Safety (REQ-350-T3)**
```typescript
// T3: "don't modify original paramValues/metadata/graph"
```

**Missing**: The `injectWorkflowParams` function is called with `cloneJson: true`, but there's no verification that the cloned graph doesn't have shared references to nested objects. Deep clone verification is not performed.

---

### 9. **Seed Mode Change During Active Batch (REQ-350-T5)**
```typescript
// T5: "mode toggle doesn't change base value"
```

**Missing**: If a user changes the seed mode (fixed→random) *after* batch preparation but *before* submission, what happens? The batch was prepared with one mode, but the UI now shows another. No validation prevents this state drift.

---

### 10. **Network Failure Retry Behavior (REQ-350-T7)**
```typescript
// T7: "runtime metadata corruption and retry same request same graph"
```

**Missing**: The exact retry semantics are not defined. Should the batch be re-submitted with frozen values, or regenerated? If regenerated, the seed freeze is violated.

---

## Feature Overlaps & Conflicts

### 11. **Global Seed vs. Per-Set Seed (REQ-350-T5)**
```typescript
// T5: "legacy global Seed row displays only if nonseed Sampler_Seed mapping exists"
```

**Overlap**: The existing REQ-350 implementation already has a global seed mechanism. This new per-set seed could completely replace it, but the overlap isn't clearly documented. Users might expect both to work together, creating unpredictable behavior.

---

### 12. **Seed Sync with Param Sync Groups (REQ-350-T3)**
```typescript
// T3: "seed->seed sync shares parent mode/base value/actual used value"
```

**Overlap**: This is a specialized case of the existing param sync mechanism, but seed has unique requirements (UINT32_MAX range, per-slot randomness). The generic sync code may not handle seed-specific edge cases correctly.

---

## Recommendations for SSoT Integrity

| Priority | Issue | Fix Required |
|----------|-------|--------------|
| **Critical** | Seed mode/value race condition | Add snapshot capture at batch start |
| **Critical** | Dual seed source ambiguity | Define explicit precedence (dedicated > legacy) |
| **High** | Random per-set vs. single draw | Implement shared random generator for synced seeds |
| **High** | Batch size limits in random mode | Add configurable max batch size with warning |
| **Medium** | Empty batch edge case | Add guard clause returning early with validation |
| **Medium** | Concurrent edit protection | Add optimistic lock or snapshot mechanism |
| **Low** | Graph mutation safety | Implement deep clone verification |

---

## Final Verdict

The requirements are **logically inconsistent in 4 areas** and **missing critical edge case handling for production reliability**. The implementation should be blocked until:

1. Seed freeze semantics are explicitly defined with snapshot capture
2. Dual seed source precedence is documented and implemented
3. Random draw sharing for synced seeds is resolved
4. Batch size limits are added for random mode

**SSoT Integrity Risk**: HIGH — Without these fixes, users will experience non-deterministic generation behavior that cannot be reliably reproduced.
~~~

## Cleanup output

~~~text
[Model Auto-Router] Unloading all loaded models (qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored) to free VRAM...
[Model Auto-Router] All models unloaded from LM Studio. VRAM freed.
nvidia-smi: 
Line |
   2 |  nvidia-smi --query-gpu=memory.total,memory.used,memory.free --format= …
     |  ~~~~~~~~~~
     | The term 'nvidia-smi' is not recognized as a name of a cmdlet, function, script file, or executable program.
Check the spelling of the name, or if a path was included, verify that the path is correct and try again.
No models are currently loaded.

To load a model, run:

    lms load <model path>
~~~
