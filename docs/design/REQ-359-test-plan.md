# REQ-359 検証計画

## 検証対象と配置

新しい ticket-named test file は作らない。ACごとのテストは既存の colocated test file に追加する。

| AC | 既存テストファイル | ケース名 | 層 |
|---|---|---|---|
| AC-1 | `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | `[REQ-359/AC-1] converges after both queries under whole-store subscription` | hook/store integration |
| AC-2 | `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | `[REQ-359/AC-2] preserves workflow identity and avoids repeat writes after unrelated store update` | hook/store integration |
| AC-3 | `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | `[REQ-359/AC-3] detects Anima and non-Anima workflow switches, including same-model reselection` | hook + real store |
| AC-4 | `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | `[REQ-359/AC-4] retains raw slot state while filtering disabled mappings from generation clone` | unit |
| AC-5 | 上記2ファイルとfrontend typecheck | `[REQ-359/AC-5] targeted checks pass` | static + unit |

## ケース詳細

### AC-1 / AC-2 / AC-3: Hook統合

- `fetch` transportだけをstubし、実API client、React Query provider、hook、`generationWorkflow`、Zustand store/actionは実コードを使う。`fetch` stubはURLごとにworkflows、workflow details、mapping masters、base models、param type masters、Comfy object infoの応答を返す。
- renderHook callback内で `useGenerationStore()` をselectorなしで呼び、実ページのwhole-store subscriptionを再現してから `useWorkflowManagement` を呼ぶ。別途 `useGenerationStore.subscribe` で通知回数を観測し、store actionをspyやmockで置き換えない。
- **AC-1 exact assertions:** workflow mappings取得後かつAnima判定後まで待ち、`isAnimaMode === true` を確認する。その同じ `true` 値をsetterへ再設定し、`workflow`参照が変わらず、query解決後の `renderCount < 12` を確認する。hook全体の実行がReact更新深度例外なしで完了する。
- **AC-2 exact assertions:** baseModels取得によるAnima自動判定直後のstore notification数が `1`。`unrelatedTestField` の更新後はnotification数が `2`、`isAnimaMode === true`、派生 `workflow` の参照が更新前後で同一、`renderCount < 12` を確認する。通知2回目は無関係field更新分であり、Anima modeの追加更新がないことを表す。
- **AC-3 exact assertions:** workflow 7 (Anima) 初期判定後notification数 `1`。同じbase modelを参照するworkflow 9へ切替後もmodeはtrueで通知数 `1`。functional setterを同一 `act` 内で2回反転後はmodeがtrueに戻り通知数 `3`。明示的にfalseへ切替後は通知数 `4`。workflow 8 (SDXL) へ切替後もfalse・通知数 `4`、workflow 7 (Anima) へ戻すとtrue・通知数 `5`。
- `useGenerationStore.subscribe` で通知数を観測し、store actionをspy/mockで置き換えない。各テストの期待値は上記のケース別exact countとする。

### AC-4: disabled mapping保持

- 既存 `wiringStageGroups.test.ts` の `generationWorkflow` 契約テストを拡張する。
- 明示disabled mappingだけが生成cloneから除外されること、raw mappings / `mapping_slot_states` / 配列順序が変更されないことを確認する。

### AC-5: コマンド

```powershell
cd frontend
npx vitest run src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts -t "REQ-359/AC-"
npx vitest run src/utils/__tests__/wiringStageGroups.test.ts -t "REQ-359/AC-4"
npm run typecheck
```

## E2E受入パス

Gate 3でブラウザから `http://localhost:<frontend-port>/` を開く。workflow一覧・workflow本体・baseModelsの応答完了後、Generate画面が表示されること、コンソールに `Maximum update depth exceeded` がないことを確認する。続けてAnima modelのworkflowと通常modelのworkflowを選び、Anima表示が選択に追従することを確認する。ブラウザ確認は自動化可能なhook状態遷移を置き換えず、実ページの起動経路の証拠とする。

## Red Team / 境界ケース

- workflowが未選択、未取得、取得中の間はAnima effectがstoreを更新しない。
- baseModelsが空またはworkflowの `target_base_model_id` がnull/未知IDの場合はAnima=falseへ収束する。
- 同じAnima modelの別workflowへ切り替えた場合に不要な同値store更新を繰り返さない。
- workflowの `mapping_slot_states` が省略、空、未知keyを含むケースで既存filter契約を崩さない。
- raw workflowをfreezeした入力としてclone生成を試し、mutationが起きないことを既存のclone契約に含める。

## Tier / Seam

- Tier 1: hook/render収束とworkflow cloneのunit/integration test、typecheck。
- Tier 2: なし（DBやHTTP業務フロー変更なし）。API transportのみ切断する。
- Tier 3: 最小のブラウザ起動確認のみ。画面実装の詳細はjsdom hookテストで確認でき、実ブラウザでは起動経路とReact runtime errorの不在を確認する。
- External I/O fault injection: API contract変更なし。ローディング/未データ状態のみを境界入力として確認。
