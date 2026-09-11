# インシデントレポート: プリセット一括編集後にアクティブプリセットのプロンプト変更がUIに即時反映されない不具合

## 1. 事象概要 (Overview)

プリセットの一括編集（Bulk Edit）機能においてプロンプトを編集した際、一括編集の対象に「現在アクティブになっているプリセット」が含まれていると、一括編集完了後に GeneratePage に戻っても編集前のプロンプト（チップ表示等）が維持され続ける。
一方、一度別のプリセットタブをアクティブにしてから再度対象プリセットに戻ると、編集後のプロンプトが正常に反映される。

調査の結果、バックエンドへの更新リクエストおよび TanStack Query キャッシュの更新は正常に完了しているものの、**フロントエンドのローカル状態管理（`usePresetState.ts`）におけるアクティブプリセットの同期処理において、プロンプトのチップ表現（`promptChips`）のパース・更新処理および開いているタブセット（`sets`）への同期が欠落していること**が判明した。

---

## 2. 観測ログおよび実機追跡結果 (Observed Evidence & Log Citations)

### 2.1 アプリケーションログ追跡 (`logs/app.jsonl`)
`scripts/inspect_logs.py` を用いて直近ログを調査：
- `python scripts/inspect_logs.py --summary`
  - Total Entries: 1065 (INFO: 1063, ERROR: 2)
- `python scripts/inspect_logs.py --errors --tail 10`
  - 直近のエラーは開発過渡期の 00:07:41 `useRef is not defined`（現在は解消済み）のみ。
- **結論**:
  一括編集実行時および画面復帰時において、バックエンド・フロントエンドともにランタイムエラーや例外ログは一切記録されていない。本現象はエラーを伴わない「メモリ内状態同期の不整合（サイレントな不整合）」である。

### 2.2 フロントエンド状態管理の追跡結果
1. **`usePresetState.ts` の `handleBulkEditApply` (L456-L474)**:
   - サーバー更新成功後、アクティブプリセットに対して以下を実行している：
     ```typescript
     if (String(preset.id) === String(activeSetId)) {
       lastSavedStateRef.current[preset.id] = { ... }
       setParamValues(newParamValues)
       setAppliedAssets(newAppliedAssets)
       if (newBatchSize !== undefined) setBatchSize(newBatchSize)
       updateActiveSet({
         paramValues: newParamValues,
         appliedAssets: newAppliedAssets,
         batchSize: newBatchSize,
       })
     }
     ```
   - **欠落点**: `paramValues`（文字列辞書）は更新されているが、UIコンポーネントが直接参照している `promptChips`（タグチップ配列辞書）のパースおよび更新（`setPromptChips`）が一切呼ばれていない。また、`updateActiveSet` にも `promptChips` が渡されていない。
   - さらに、一括編集の対象となった他の開いているタブ（`sets` 内の他プリセット）に対する状態更新も行われていない。

2. **UI レンダリングと `TagChipEditor` のキー (DesktopLayout L610-L614, MobileLayout L724)**:
   - `TagChipEditor` は `key={`${activeSetId}-${m.role!}`}` でマウントされている。
   - 一括編集前と後で `activeSetId` は変化しないため、コンポーネントの再マウント（アンマウント＆初期化）は発生しない。
   - `TagChipEditor` に渡される props は `value={paramValues[m.role!]}`（更新後文字列）と `chips={promptChips?.[m.role!]}`（**未更新の古いチップ配列**）である。
   - `TagChipEditor` 内部（`index.tsx` L140-L160）では、外部からの `value` 変更検知時に `isExternalUpdateRef.current = true` となり、親ストアへの `onChipsChange` 発火が抑止される設計となっているため、Zustand ストア内の `promptChips` は古いチップ配列のまま残存する。

3. **生成処理への波及 (`multiSetSlice.ts` L22-L33 `getEffectiveParamValues`)**:
   - 画像生成時にプロンプトを構築する `getEffectiveParamValues()` は、`promptChips` に要素が存在する場合、`paramValues` よりも `promptChips` の文字列表現（`chipsToString(chips)`）を優先して採用する。
   - したがって、ストア内の `promptChips` が更新されない限り、一括編集後であっても古いプロンプトで画像生成が行われてしまう。

4. **別プリセット切り替えで反映される理由 (`multiSetSlice.ts` L286-L356 `loadPresetData`)**:
   - 別のプリセットタブをクリックして再度元のプリセットをクリックすると、`handleLoadPreset` から `loadPresetData` が実行される。
   - `loadPresetData` は `parseToChips(val)` を呼び出して最新の `param_values` から `initialPromptChips` を構築し、`paramValues` と `promptChips` の双方をストアおよび `sets` に正しくセットする。
   - 同時に `activeSetId` の変更に伴い `TagChipEditor` の `key` が変わり、再マウントされて最新のチップが表示される。

5. **自動同期機構のバイパス (`usePresetState.ts` L453, L808-L850)**:
   - `handleBulkEditApply` の L453 で `presetUpdatedAtRef.current[res.id] = res.updated_at` が即座に代入されている。
   - これにより、クエリキャッシュ無効化後にバックグラウンドで走る同期エフェクト（L811: `activePreset.updated_at !== prevUpdatedAt`）が `false` と判定され、サーバー最新状態との自動同期（`loadPresetData` の呼び出し）がバイパスされている。

---

## 3. 再現手順と観測された挙動 (Reproduction Steps)

### 再現手順
1. GeneratePage を開き、任意のプリセット（例:「Preset A」）をアクティブにする。Positive Prompt に任意のタグ（例: `masterpiece, 1girl, solo`）が設定されていることを確認する。
2. プリセット管理パネルを開き、「Preset A」を含む複数のプリセットを選択して「一括編集」を押下する。
3. 一括編集モーダルにて、プロンプトの編集（例: サフィックス追加 `, high quality`）を設定し、「適用」を押下する。
4. 一括編集完了後、プリセット管理パネルを閉じて GeneratePage のメイン画面に戻る。

### 観測された挙動
- **実際の挙動（不具合）**:
  - 画面上の Positive Prompt（`TagChipEditor`）には一括編集前のプロンプト（`masterpiece, 1girl, solo`）が表示されたまま維持される。
  - そのまま「生成」ボタンを押下した場合も、編集前のプロンプトで生成が実行される。
  - 別のプリセットタブを選択した後に再度「Preset A」のタブを選択すると、一括編集で追加した `, high quality` が反映された状態に変化する。
- **本来期待される挙動**:
  - 一括編集が完了してメイン画面に戻った時点で、アクティブプリセットのプロンプト表示およびストア内のチップ・パラメータが即座に最新状態に同期・反映されること。

---

## 4. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 分類 | 対象ファイル | 該当行/箇所 | 詳細 |
|---|---|---|---|---|
| 1 | 一括編集のアクティブプリセット同期不備 | `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` | L456-L474 (`handleBulkEditApply`) | `setParamValues`・`updateActiveSet` のみ行い、`promptChips` のパース・設定（`setPromptChips`）および `sets` 内の同プリセットの `promptChips` 更新が欠落。 |
| 2 | 開いているタブセット（`sets`）の同期欠落 | `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` | L456-L474 (`handleBulkEditApply`) | 一括編集対象となった他の開いているタブ（`sets` 内のプリセット）の `paramValues` や `promptChips` が更新されず、タブ切り替え時に古い状態が残存するリスクがある。 |
| 3 | SSoT 同期ロジックとの非対称性 | `frontend/src/store/slices/multiSetSlice.ts` | L286-L356 (`loadPresetData`) | `loadPresetData` では `parseToChips` による `promptChips` 構築・`sets` 全体への反映が行われているが、`handleBulkEditApply` では同等の処理が行われていない。 |
| 4 | 自動同期エフェクトの抑止 | `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` | L453, L808-L850 | 更新直後に `presetUpdatedAtRef` を更新することで衝突検知を回避しているが、結果として `loadPresetData` によるバックグラウンド再同期もスキップされている。 |

---

## 5. 根本原因の分析 (Root Cause Analysis)

1. **`handleBulkEditApply` におけるチップ状態（`promptChips`）同期の欠落 (Primary)**:
   - プリセットのプロンプト状態は、文字列形式の `paramValues` と、UIおよび生成処理で最優先される `promptChips` の二重管理となっている。
   - 通常のプリセット読み込み（`loadPresetData`）では `paramValues` から `parseToChips` を介して `promptChips` を生成しストアに保存しているが、一括編集適用処理（`handleBulkEditApply`）では `setParamValues` のみ実行し、`promptChips` の再生成・更新を怠っていた。
   - `TagChipEditor` のコンポーネントキーは `activeSetId` に依存しているため、アクティブプリセットのまま一括編集が完了しても再マウントされず、古い `promptChips` が画面および生成処理に残留した。

2. **タブセットコレクション（`sets`）への更新未伝播 (Secondary)**:
   - マルチタブUIでは `sets` 配列に各タブの現在の状態（`paramValues`, `promptChips`, `appliedAssets` 等）が保持されている。
   - `handleBulkEditApply` はアクティブな 1 つのセット（`updateActiveSet`）のみ部分的に更新し、一括編集で変更された他のタブのメモリ内データを同期していない。

---

## 6. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

<incident_report>
- **障害分類**: **Type A (Implementation Bug / 実装上の不具合)**
- **判定理由**:
  - 要件や仕様の矛盾・不備ではなく、`usePresetState.ts` の `handleBulkEditApply` におけるフロントエンド状態（`promptChips` および `sets`）の同期漏れという、明確な実装の欠落によるものであるため。
</incident_report>

---

---

## 8. 対応完了 (Resolution)

本インシデントは **REQ-250** にて対応・検証完了：
- `frontend/src/store/types.ts` および `multiSetSlice.ts` に `setAllPromptChips` を新設。
- `usePresetState.ts` の `handleBulkEditApply` で `sets` および `promptChips` の即時パース・一括反映を実装。
- 単体テスト（`multiSetSlice.test.ts`, `useGeneratePageState.test.tsx`）およびRed Teaming検証を含む全テストをPASS。

