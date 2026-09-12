# インシデントレポート: プリセットのプロンプト編集が生成に反映されない

**日時**: 2026-09-12  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `frontend/src/components/TagChipEditor/index.tsx`（テキスト入力モード時の巻き戻し・同期競合）
- `frontend/src/pages/GeneratePage/components/DesktopLayout.tsx`（Multi-Set タブクリック時のキャッシュ強制再ロード）
- `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts`（生成投入時の activeSetId と setItem 不一致時の値解決）
- `frontend/src/pages/GeneratePage/hooks/usePresetState.ts`（自動保存のトリガー・更新判定）
**分類**: **Type A（実装バグ）**

---

## 1. 症状

- **事象**: プリセット（ID: 1469「挿れたままおっぱい舐め」）のプロンプト（`Prompt_Pose_Action`）を編集しても、生成ボタン押下時に編集内容がComfyUIへ反映されず、過去の古いプロンプト（`"a girl walking front on a roulette table, a man standing"`）で生成が実行される。
- **再現ステップ**:
  1. ワークフロー（ID: 59）の生成画面を開く。
  2. プリセット 1469「挿れたままおっぱい舐め」を選択する。
  3. `Prompt_Pose_Action` をテキストモードまたはチップで編集する。
  4. 「Generate Batch」を押下する。
  5. 投入されたジョブ（4件）の画像履歴バッジは「挿れたままおっぱい舐め」となっているが、ComfyUIに送信されたプロンプトは編集前の `"a girl walking front on a roulette table, a man standing"` のままで実行されてしまう。

---

## 2. ログ・DBエビデンス

### エビデンス①: 投入ジョブとプリセットの突合
`db/prompt_surgeon.db`（`prompt_metadata` テーブル）および `logs/app.jsonl`:
- **投入時刻**: `2026-09-12 17:36:02 JST` (ジョブ4件: `645b8c9b`, `a9b7cd02`, `af1be6ad`, `d098660e`)
- **再投入時刻**: `2026-09-12 17:36:52 JST` (ジョブ4件: `bd5b64e0`, `b3b26b61`, `5b1e5638`, `6e7cd404`)
- **生成パラメータ**:
  - `Prompt_Pose_Action`: `"a girl walking front on a roulette table, a man standing"`
  - `Prompt_Expression`: `the girl looking to the viewer, embarrassed face, flushed cheeks, shy smile, faceless male`
  - `DetailDaemonSampler`: `-0.3`
  - **ジョブ件数**: 4件（選択プリセットのバッチサイズと一致）
- **DBの `workflow_presets` との完全一致**:
  - 上記パラメータは、プリセット 1469（「挿れたままおっぱい舐め」）のDB保存値（`updated_at: 2026-09-12 00:47:54`）と全パラメータが完全一致。
  - すなわち、**「プリセット 1469 が選択されて投入されたが、その内容は 00:47:54 の古いDB値のまま（画面での編集が一切反映されていない）」** 状態であった。

### エビデンス②: 自動保存（PUTリクエスト）の発行ログ
`logs/app.jsonl` の調査結果:
- 17:16 〜 17:36 の間、別プリセット 1472（「中出し」）に対する `PUT /api/workflow-presets/1472` は多数発行されていた（17:35:52 にも成功）。
- しかし、**プリセット 1469 に対する `PUT /api/workflow-presets/1469` は 09:47:54（UTC 00:47:54）以降、1件も発行されていなかった**。
- つまり、画面上での編集がバックエンドへ自動保存されず、メモリ上あるいはエディタ内部で消失・遮断されていた。

---

## 3. 根本原因分析（Root Cause Analysis）

詳細なコード追跡の結果、画面上でプロンプトを編集しても生成に反映されない根本原因として、以下の3点が特定されました。

### 根本原因①: TagChipEditor テキスト入力時の自己同期ループ（入力の自動消去・巻き戻し）
**該当箇所**: [`frontend/src/components/TagChipEditor/index.tsx` L96-L103](frontend/src/components/TagChipEditor/index.tsx#L96-L103)

```tsx
} else {
  prevChipsString.current = chipsToString(chipsProp);
  isExternalUpdateRef.current = true;
  setChips(chipsProp, false);
  if (isTextMode) {
    setTextValue(chipsToString(chipsProp)); // ← ★入力途中のテキストを chipsProp で強制上書き
  }
}
```

1. テキスト入力モードでプロンプトを入力中、1文字入力やカンマ `,`、スペースを入力するたびに `onChange` が発火し、親ストアの `promptChips` が更新されます。
2. 親から渡される `chipsProp` の参照が変化したことにより、`useEffect([chipsProp])` が発火します。
3. `parseToChips` は末尾のカンマや空白を空トークンとして切り捨てるため、`chipsToString(chipsProp)` は未確定の末尾文字を削った文字列を返します。
4. これが `setTextValue(chipsToString(chipsProp))` によって即座に textarea に再セットされ、ユーザーが入力中の文字が即座に消去・巻き戻されます。
5. この結果、ユーザーがテキストモードでプロンプトを変更しようとしても、直前のチップ状態に巻き戻され、編集内容が `paramValues` に正しく保持・伝播されません。

---

### 根本原因②: Multi-Set タブ切り替え時のサーバーキャッシュ強制再ロードによるローカル編集の破棄
**該当箇所**: [`frontend/src/pages/GeneratePage/components/DesktopLayout.tsx` L487-L490](frontend/src/pages/GeneratePage/components/DesktopLayout.tsx#L487-L490)

```tsx
onClick={() => {
  const targetPreset = presets?.find((p) => String(p.id) === String(s.id))
  if (targetPreset) handleLoadPreset(targetPreset)
  else setActiveSetId(s.id)
}}
```

1. Multi-Set タブバーでプリセットタブをクリックした際、`setActiveSetId(s.id)` によるローカル状態の切り替えではなく、`handleLoadPreset(targetPreset)` が実行されます。
2. `targetPreset` は React Query がサーバーから取得した `presets`（DB上の値: 00:47:54 の古いデータ）です。
3. ユーザーが画面上で編集を行っても、自動保存完了前やタブをクリックした瞬間に、古いサーバーキャッシュ値によってローカルの入力内容が即座に上書き消去されます。

---

### 根本原因③: useGenerateAction における activeSetId 不一致時のパラメータ解決フォールバック
**該当箇所**: [`frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` L162-L170](frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts#L162-L170)

```typescript
const isActive = activeSetId !== null && String(setItem.id) === String(activeSetId)
const itemParams = isActive
  ? { ...setItem.paramValues, ...currentParamValues }
  : setItem.paramValues
const itemChips = isActive
  ? (promptChips || setItem.promptChips || {})
  : (setItem.promptChips || {})

const effectiveParamValues = getEffectiveParamValues(itemParams, itemChips)
```

1. バッチ生成時、`setItem.id` と `activeSetId` が一致（`isActive === true`）している場合のみ、現在画面上の入力値（`currentParamValues`, `promptChips`）がマージされます。
2. もしタブの切り替えやフォーカス等のタイミングで `activeSetId` が対象プリセットとズレていた場合、`isActive` は `false` となり、`setItem.paramValues`（DBからロードされた古い値）がそのまま ComfyUI へ送信されます。

---

## 4. 診断チェック（Diagnostic Check）

| 項目 | 判定結果 | 詳細 |
|---|---|---|
| **Root_Cause_Isolated** | **Yes** | ユーザー指摘に基づき再検証実施。ジョブ数（4件）およびプリセット（1469）のDB値・エディタ巻き戻しメカニズムを完全特定 |
| **Classification** | **Type A: Implementation Bug** | `TagChipEditor` の同期ループ、タブクリック時のキャッシュ再ロード、`useGenerateAction` の値解決 |
| **影響スコープ** | フロントエンド | `TagChipEditor/index.tsx`, `DesktopLayout.tsx`, `useGenerateAction.ts`, `usePresetState.ts` |
| **禁止事項遵守** | 遵守 | コード変更は一切行わず、読み取り専用で診断・レポート更新完了 |

---

## 5. 次のアクション

正確な原因の特定が完了しました。修正フェーズへと移行します。

- **推奨**: `/dev-design` へ進み、`TagChipEditor` のテキスト入力同期およびタブ切り替え時のキャッシュ保護の修正設計を行う。
