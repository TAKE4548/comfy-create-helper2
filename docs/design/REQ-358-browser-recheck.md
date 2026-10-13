# REQ-358 ブラウザ再確認

実施日: 2026-10-14 (Asia/Tokyo)

## 判定

**INCONCLUSIVE**。修正後のフロントエンド全suiteはPASS。今回のブラウザ再確認対象も通過した。既存のraw QA audit FAILを維持し、ブラウザfixtureでは実サーバ再起動後の永続性を検証していないため、REQ-358全体をPASSとはしない。

## 実施環境と隔離

- 開発Vite (`http://127.0.0.1:5173`) の実Reactをheadless Chromeで操作した。
- Chrome CDP Fetchでアプリの`/api/*`をすべてインメモリfixtureへ応答し、PUTもfixture内だけで更新した。ユーザーDBへの書き込みはない。
- 再スキャンの保存→閉じる→再表示はフロントエンド状態遷移の確認であり、実サーバDB再起動後の永続性を証明しない。ステージActive false→trueの実API永続性は別途backend test証拠で判断する。
- Generate操作は行わず、fixtureのgeneration状態を空にした。runtime/console errorは0件。
- `websocketRequests`にVite originからの接続試行2件を記録したが、生成操作や実生成要求は発生していない。

## Acceptance Evidence

| 対象 | 結果 | 実行観測 |
|---|---|---|
| T32: 再スキャンで一括無効化したstage | PASS (fixture UI範囲) | FaceDetailerを無効化して保存。PUTの`mapping_slot_states`で`v:102`と`v:103`がfalse。閉じて再表示後もFaceDetailerチェックはfalse、mapping ID 2とタイトル/class/scoreは保持、無効行は編集不可表示。 |
| T32: 既存値を持つ無効legacy null-variant mapping | PASS (fixture UI範囲) | raw mappingは`variant_id:null`, role `Sampler_Seed`、値`111`。一意なMain variant `v:104`をfalseにした状態で生成画面のglobal Seed入力にそのlegacy値は現れず、raw assignmentを保持した。画面上のSeed入力は独立したFaceDetailer seedのみ。 |
| T33: stageを含むスコア順位 | PASS (browser) | FaceDetailer Steps候補でFace Detailer 100%、Hand Detailer 62%、Main Sampler 55%の順。タイトル/クラス/ステージを含む百分率表示を確認。 |
| T33: 選択済みselectorの閉状態情報 | PASS (browser) | input欄内にnode title、class、ID、scoreを表示。未割当slotも編集可能で、未割当ラベルを確認。 |
| T33: 無効値と空欄の区別 | PASS (browser) | 無効行はID・node metadataを残したままチェックoff/read-only。空欄は「未割当」かつ利用許可checkedで編集可能。 |
| T34: Stage Active false→true | PASS (SQLite/API test evidence supplied by implementation agent) | `backend/tests/test_req336_stage_api.py`: 5 tests passed。SQLite-backed API testで2 variants (元々個別無効を含む) がfalse→true遷移で有効化され、別stageは変化せず、mapping/stateは保持される。これはSQLite/API永続性の証拠であり、アプリ再起動後の検証ではない。mypy stage routerもPASSとの報告。 |

Browser screenshots:
- [候補の百分率とstage順位](REQ-358-evidence/candidate-dropdown.png)
- [保存後再表示した無効行と保持値](REQ-358-evidence/rescan-reopened.png)

注: 候補reason文言を日本語化する小規模UI修正より前に撮影したため、ドロップダウン内のreason例は英語表示。スコア順位・マッピング状態への変更ではない。修正後の `MappingNodeSelector.test.tsx` は2 tests PASSとの報告あり。

## Baseline 3-Gate

### Gate 1: Static check

- `frontend`: `npm run typecheck` — PASS (exit 0)。
- `backend`: stage router mypy — implementation agent報告でPASS。こちらでは再実行していない。

### Gate 2: Full test suite

- 最初の昇格実行では `src/components/__tests__/WorkflowModalEditing.test.tsx` が、更新T32 scopeに沿う「未割当」表示を旧語「未使用」として検証して失敗した (230/231 files、2157/2158 tests)。scopeに合わせて期待表示、非減光、`input.readOnly=false`へ修正。対象テスト単体もPASSを確認した。
- その後の最終全suite `npm test -- --reporter=dot` はPASS: 231/231 files、2158/2158 tests、exit 0、78.27秒。compact log: `.tmp/req358-browser-verify/frontend-full-suite-final.log`。後続のreason文言日本語化後には該当 `MappingNodeSelector.test.tsx` 2 tests PASSとの報告があり、全suiteはその表記変更後には再実行していない。
- 初回制限実行はVitest workerの`realpath setup.ts` EPERMで収集開始前に失敗。承認された昇格実行で全suiteを実施し、scope更新後に全suite PASSを確認した。
- Test hygieneは旧ticket名テストに違反を報告するが、既存のaccepted baseline debtとして扱う（今回の新規違反とは確認していない）。raw hygiene FAILは記録上保持する。

### Gate 3: Scenario / Red Team

今回対象とした再スキャンの保存・再表示、無効mappingの値保持と生成UI除外、百分率順位、未割当/無効の編集可否を上表の通り確認した。fixtureはUI隔離に使ったため実DB永続性の証拠としては使わない。前回のraw QA audit verdict **FAIL** は保持し、再実行していない。

## 制約

この文書はT32/T33/T34再確認の証拠であり、全38 ACの再監査、QA audit再評価、REQ/PBI lifecycle変更の記録ではない。

### 作業後の一時環境

- 後続の昇格cleanupで、作業専用プロファイルの絶対pathと`--headless`が一致するChrome root 4件だけを特定し、その子を含む16件を停止した。workspace内の包含確認後、残ったprofileディレクトリ2件を削除。通常Chromeをプロセス名で一括終了していない。スクリーンショット/log/scriptは保持した。CDPの9249番portは終了済み。
- reason日本語化後の最終frontend typecheckはexit 0。
