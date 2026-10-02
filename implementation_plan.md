# Implementation Plan - REQ-297: プリセット一括編集モーダルの利便性向上 (入力クリア・自動閉じ抑止・サブセット抽出・対象排他制御・パラメータ検索・タグ操作統一)

プリセット一括編集モーダル（ProfileBulkEditModal）における連続作業の障害となっていた自動クローズを撤廃し、ワンクリック入力クリア、適用後のパラメータ選択自動解除、共通タグの動的サブセット抽出・再集計、プロンプト対象欄のモード別排他制御、パラメータのインクリメンタル検索フィルタ、および共通タグチップのポップオーバー編集サブメニュー統一を実装します。

---

## Proposed Changes

### Frontend Subsystem

#### [LOCAL MODIFY] [types.ts](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/types.ts)
- BulkEditPayload に 	argetPresetIds?: number[] を追加し、サブセット指定のプリセットに対してのみパッチを適用可能にする。
- BuildPayloadParams に subsetPresetIds?: Set<number> を追加。

#### [LOCAL MODIFY] [buildPayload.ts](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/buildPayload.ts)
- promptOp === 'remove_tags' の場合、subsetPresetIds を payload.targetPresetIds として注入。

#### [LOCAL MODIFY] [useProfileBulkEditState.ts](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/useProfileBulkEditState.ts)
- subsetPresetIds: Set<number> の状態管理とトグル/全選択/全解除ハンドラを追加。
- チェックされたプリセット群から動的に computedCommonTags を再計算。
- パラメータ選択状態（enabledParams, atchSizeEnabled）を未選択に初期化する esetParamSelection() を提供。
- setPromptOp において、overwrite / prefix / suffix への切り替え時に promptTargetAll を false とし、promptTargetFields を先頭1件にフォールバック（AC-5）。

#### [LOCAL MODIFY] [usePresetState.ts](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/GeneratePage/hooks/usePresetState.ts)
- handleBulkEditApply において、payload.targetPresetIds が存在する場合はそのサブセットのみを更新対象にフィルタリング。
- 適用成功時の setIsBulkEditOpen(false) および setBulkTargetIds([]) を削除し、モーダルを開いたまま維持。
- 適用成功通知トースト（setErrorToast({ message: '...', type: 'success' })）を表示。

#### [LOCAL MODIFY] [index.tsx](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/index.tsx)
- handleConfirm で適用完了後に state.resetParamSelection() を呼び出し、パラメータチェック状態を自動解除。
- モーダル全体に対する Escape キーリスナーを登録し、キー押下による明示的クローズに対応。

#### [LOCAL MODIFY] [PromptOperationForm.tsx](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/tabs/PromptBulkEditTab/PromptOperationForm.tsx)
- promptFindText, promptReplaceText, promptValue の各入力欄に「クリア」ボタンを追加。
- 入力が空の場合はボタンを非活性または非表示とし、押下時に即時空文字へリセット。

#### [LOCAL MODIFY] [TargetFieldsSelector.tsx](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/tabs/PromptBulkEditTab/TargetFieldsSelector.tsx)
- promptOp に応じた排他制御：
  - search_replace: 「すべて対象」チェックボックスおよび複数フィールド選択可能。
  - overwrite / prefix / suffix: 「すべて対象」を非表示とし、単一選択ラジオボタン動作を強制。

#### [LOCAL MODIFY] [CommonTagsSection.tsx](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/tabs/PromptBulkEditTab/CommonTagsSection.tsx)
- 最上部に対象プリセット絞り込みセクション（チェックボックス一覧、全選択・全解除）を追加。
- タグチップ本体クリック時の削除トグルを廃止し、クリックで編集ポップオーバーを展開。
- 各タグチップ右端に独立した削除アイコン（X）を設置し、削除フラグのトグルに対応。

#### [LOCAL NEW] [CommonTagSubmenu.tsx](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/tabs/PromptBulkEditTab/CommonTagSubmenu.tsx)
- タグ文言編集、強度直接数値入力、ステップ増減ボタン（-0.3, -0.1, +0.1, +0.3）、削除ボタンを備えた軽量ポップオーバー。
- Escape キー押下および外側クリック時にイベントのバブリングを防止して自身のみをクローズ。

#### [LOCAL MODIFY] [ParamBulkEditTab/index.tsx](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/ProfileBulkEditModal/tabs/ParamBulkEditTab/index.tsx)
- パラメータ一覧最上部にインクリメンタル検索ボックスとクリアボタンを追加。
- searchQuery による paramRoles およびバッチサイズ項目の部分一致フィルタリング。
- 該当0件時の空メッセージ表示。
- フィルタ状態とチェック状態（enabledParams）の完全独立性を保証。

#### [LOCAL MODIFY] [ProfileBulkEditModal.test.tsx](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/__tests__/ProfileBulkEditModal.test.tsx)
- AC-1 〜 AC-7 の全振る舞いおよび Red Team 異常系ケースを検証する単体・統合テストを追加。

---

### Documentation Subsystem

#### [LOCAL MODIFY] [SPEC_COMMON.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/specs/SPEC_COMMON.md)
- セクション 5-4 に REQ-297 で導入された全仕様（入力クリア、モーダル維持・ESC制御、パラメータ自動解除、共通タグ動的サブセット抽出、単一排他制御、インクリメンタル検索、サブメニュー統一）を同期反映。

---

## Verification Plan

### Automated Tests
1. **フロントエンド型チェック (Static Typecheck)**:
   - cd frontend; npm run typecheck (エラー 0 件)
2. **コンポーネント・フック単体テスト (Unit Tests)**:
   - cd frontend; npx vitest run src/components/__tests__/ProfileBulkEditModal.test.tsx
   - cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx
3. **全件回帰テスト (Full Test Suite Baseline)**:
   - cd frontend; npm test (全件 PASS)

### Manual Verification
1. プリセット一括編集モーダルを開き、プロンプト入力欄にテキスト入力後、「クリア」ボタンで即座に空になることを確認。入力したまま一度閉じて再表示した際に値が保持されることを確認（AC-1）。
2. パラメータタブで複数項目にチェックを入れ適用を実行。適用成功後にモーダルが開いたままであること（AC-3）と、パラメータのチェックが自動で全て外れること（AC-2）を確認。
3. 共通タグ編集タブでプリセットのチェックを一部外し、共通タグが即座にサブセット対象のみに再計算されることを確認。適用時に外したプリセットが変更されないことを確認（AC-4）。
4. 操作タイプを「置換」から「上書き」に変更した際、対象フィールドが単一ラジオ選択に切り替わり先頭1件にフォールバックすることを確認（AC-5）。
5. パラメータ検索欄に文字を入力してリアルタイム絞り込みを確認し、チェックを入れた状態で検索クリアしても選択が維持・適用されることを確認（AC-6）。
6. 共通タグチップをクリックしてポップオーバーが開き、強度変更および文言編集ができること、チップ上の X ボタンで削除対象にマークできることを確認（AC-7）。
7. ポップオーバー表示中に Escape を押すとポップオーバーのみが閉じ、再度 Escape を押すとモーダル本体が閉じることを確認（Red Team 3）。

---

## Task Dependency & Parallelization

`mermaid
graph TD
    T1["REQ-297-T1: 状態管理・ペイロード拡張<br/>(types.ts, buildPayload.ts, useProfileBulkEditState.ts)"]
    T5["REQ-297-T5: パラメータ検索フィルタ<br/>(ParamBulkEditTab/index.tsx)"]
    
    T2["REQ-297-T2: モーダルライフサイクル・自動閉じ抑止<br/>(usePresetState.ts, index.tsx)"]
    T3["REQ-297-T3: プロンプト入力クリア・対象欄排他制御<br/>(PromptOperationForm.tsx, TargetFieldsSelector.tsx, index.tsx)"]
    T4["REQ-297-T4: 共通タグサブセット抽出・サブメニュー編集<br/>(CommonTagsSection.tsx, CommonTagSubmenu.tsx)"]
    
    T6["REQ-297-T6: 統合テスト拡充・SSoT仕様書同期<br/>(ProfileBulkEditModal.test.tsx, SPEC_COMMON.md)"]

    T1 --> T2
    T1 --> T3
    T1 --> T4
    
    T2 --> T6
    T3 --> T6
    T4 --> T6
    T5 --> T6
`

| タスクID | サブシステム | 対象ファイル | 依存関係 | 並列実行性 | 単体検証コマンド |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-297-T1** | frontend | 	ypes.ts, uildPayload.ts, useProfileBulkEditState.ts | なし (Root) | 可 (T5と並列可能) | cd frontend; npx vitest run src/components/ProfileBulkEditModal/__tests__/utils.test.ts |
| **REQ-297-T5** | frontend | 	abs/ParamBulkEditTab/index.tsx | なし (Root) | 可 (T1と完全並列) | cd frontend; npx vitest run src/components/__tests__/ProfileBulkEditModal.test.tsx |
| **REQ-297-T2** | frontend | usePresetState.ts, index.tsx | REQ-297-T1 | 可 (T3, T4と並列) | cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx |
| **REQ-297-T3** | frontend | PromptOperationForm.tsx, TargetFieldsSelector.tsx, PromptBulkEditTab/index.tsx | REQ-297-T1 | 可 (T2, T4と並列) | cd frontend; npx vitest run src/components/__tests__/ProfileBulkEditModal.test.tsx |
| **REQ-297-T4** | frontend | CommonTagsSection.tsx, CommonTagSubmenu.tsx | REQ-297-T1 | 可 (T2, T3と並列) | cd frontend; npx vitest run src/components/__tests__/ProfileBulkEditModal.test.tsx |
| **REQ-297-T6** | frontend/docs | ProfileBulkEditModal.test.tsx, SPEC_COMMON.md | T2, T3, T4, T5 | 順次 (全先行タスク完了後) | cd frontend; npm run typecheck && npm test |

---

## Trade-off Disclosure

1. **適用後のモーダル維持に伴うキャッシュ同期と連続編集の整合性**:
   - **Trade-off**: 一括適用成功後にモーダルを閉じない仕様としたことで、同一モーダル内で連続して編集・適用を行った際、プリセットのローカルキャッシュとサーバー側の最新状態（updated_at / OCC）にズレが生じ、409 Conflict が発生するリスクがあります。
   - **Mitigation**: usePresetState.ts の handleBulkEditApply において、qc.setQueryData および presetUpdatedAtRef への最新タイムスタンプ同期を同期的かつ確実に実行し、後続の適用処理が常に最新バージョンを参照するよう保護します。
2. **サブセット抽出時の動的共通タグ再計算コスト**:
   - **Trade-off**: プリセットチェックのON/OFFの都度、クライアント側で全プロンプトのトークンパースおよび共通タグ積集合計算（computeCommonTags）が同期実行されるため、プリセット件数が多い場合にUIレスポンスが低下する懸念があります。
   - **Mitigation**: computeCommonTags は純粋関数として最適化されており、数十件規模のプリセットであれば数ミリ秒以内で完了します。また、subsetPresetIds の変更時にのみ再計算を行うため、不要な再描画は最小限に抑えられます。
3. **パラメータ検索による非表示項目の意図しない適用リスク**:
   - **Trade-off**: 検索ボックスにより画面外に隠れたパラメータ項目も、チェックが入っていれば適用ペイロードに含まれる仕様であるため、ユーザーが以前の選択を忘れたまま適用してしまうリスクが存在します。
   - **Mitigation**: AC-2 で定めた「適用成功時のパラメータ選択自動全解除」により、前回の選択が残留する根本原因を排除します。さらに、適用確認画面（BulkEditConfirmView）にて適用されるパラメータ件数を明示的に確認できるようにします。
