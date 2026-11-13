---
title: "REQ-427: 参照画像（ref画像）入力型・汎用ロールおよび画像選択UI テスト計画書"
tags:
  - REQ-427
  - test-plan
  - ref-image
related_paths:
  - docs/backlog/pbi/active/REQ-427.md
  - docs/design/REQ-427.md
  - backend/tests/unit/test_ref_image_store.py
  - backend/tests/integration/api/test_ref_images.py
  - backend/tests/integration/services/test_ref_image_gc.py
  - backend/tests/integration/api/test_workflows.py
  - backend/tests/integration/api/test_presets.py
  - backend/tests/integration/api/test_snapshots.py
  - backend/tests/integration/legacy/test_comfy_generation_bridge.py
  - backend/tests/integration/legacy/test_generation_service.py
  - backend/tests/governance/test_openapi_contract.py
  - frontend/src/utils/__tests__/refImage.test.ts
  - frontend/src/utils/__tests__/workflowParamInjector.test.ts
  - frontend/src/utils/__tests__/generationRecord.test.ts
  - frontend/src/components/__tests__/MappingMasterEditModal.test.tsx
  - frontend/src/components/__tests__/ImageParamField.test.tsx
  - frontend/src/components/__tests__/RefImagePickerModal.test.tsx
  - frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx
  - frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts
  - frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts
  - frontend/e2e/generateParamImageField.spec.ts
  - frontend/src/components/__tests__/ProfileBulkEditModal.test.tsx
  - frontend/src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts
  - frontend/e2e/profileBulkEditImage.spec.ts
---

# REQ-427: 参照画像（ref画像）入力型・汎用ロールおよび画像選択UI テスト計画書

## 1. リスク評価と検証プロファイル

- **リスク分類**: `high`
  - 根拠: 新規公開 API（`/api/ref-images`）と OpenAPI 契約の拡張、生成 worker（上流投入経路）への処理追加、永続データを削除する GC（DB 全テーブル走査・ファイル削除・lifespan 常駐タスク）の追加、起動時 seed（共有マスタデータ）の追加、ファイルストア（永続データ）の新設、Generate/Settings の共有 UI 部品（`ParamPanel`）の変更を含むため。
- **検証プロファイル**: **V1 Baseline（既定）**。V2 opt-in は採用しない（承認済み低リスクプロファイルが存在せず、かつ high リスク）。
  - **Gate 1（静的・単体）**: `backend\.venv\Scripts\python.exe -m mypy backend` / `backend\.venv\Scripts\python.exe -m pytest backend/tests/unit` / `backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/**/__tests__` / `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py` / `npm.cmd --prefix frontend run typecheck` / `backend\.venv\Scripts\python.exe scripts/verify_openapi_sync.py` / `backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict`
  - **Gate 2（フルスイート探索、ファイルフィルタなし）**: `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`
  - **Gate 3（シナリオ・境界・Red Team）**: `backend\.venv\Scripts\python.exe scripts/run_e2e.py`（全 spec）＋本書 §5 の Red Team シナリオの独立実行。

---

## 2. 実行ティア

| Tier | 内容 | 対象ファイル |
|---|---|---|
| `unit` | 純粋ロジック（トークン解析・graph 置換・ストア検証・FE トークン判定・注入関数）、PBT | `backend/tests/unit/test_ref_image_store.py`、`backend/tests/integration/legacy/test_generation_service.py`（`collect_ref_ids`/`replace_ref_tokens` の PBT 節）、`frontend/src/utils/__tests__/refImage.test.ts`、`frontend/src/utils/__tests__/workflowParamInjector.test.ts` |
| `integration` | router + ストア（実ファイル tmp）+ DB SAVEPOINT、GC + テスト DB 全テーブル走査 + tmp ストア（`backend/tests/integration/services/test_ref_image_gc.py`）、seeder + scanner + workflows API、presets/snapshots API、GenerationService + Supplier + Store + FakeBridge、bridge + `httpx.MockTransport`、FE コンポーネント + ストア + `request`（`fetch` 切断） | `backend/tests/integration/api/test_ref_images.py`、`test_workflows.py`、`test_presets.py`、`test_snapshots.py`、`backend/tests/integration/legacy/test_comfy_generation_bridge.py`、`test_generation_service.py`、`frontend/src/components/__tests__/ImageParamField.test.tsx`、`RefImagePickerModal.test.tsx`、`MappingMasterEditModal.test.tsx`、`frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx`、`frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts`、`useGenerateAction.test.ts`、`frontend/src/utils/__tests__/generationRecord.test.ts` |
| `e2e` | jsdom で検証できない実寸レイアウト（44×44px 実測、360px 幅の横はみ出しなし、モバイルボトムシート、一括編集モーダル上のピッカー前面表示） | `frontend/e2e/generateParamImageField.spec.ts`、`frontend/e2e/profileBulkEditImage.spec.ts` |
| `scenario` | 生成フルフロー（選択 → 生成 → 上流 upload → `/prompt` の置換確認）、失敗時保持、無効化・再有効化 | `test_generation_service.py` の scenario 節、`ParamPanel.test.tsx` の scenario 節、Gate 3 Red Team |

Tier 1〜3 の時間目標は参考値。全テストは CPU/RAM のみ（GPU 不使用、ComfyUI 実体に接続しない）。

---

## 3. 環境・収集設計

- **ランタイム**: Python は `backend\.venv`（既存依存: Pillow, python-multipart, respx, hypothesis, httpx）。Node は `frontend/node_modules`（vitest, @testing-library/react, fast-check, Playwright）。新規依存は追加しない。
- **隔離**: BE は `conftest.py` の `isolated_snapshot_dir`（autouse）で `settings.snapshot_dir` を tmp に差し替えるため、ストアルート（`snapshot_path.parent / "ref_images"`）も tmp 配下になる。`mock_external_services`（respx）で ComfyUI 実通信を遮断する。
- **画像フィクスチャ**: テスト内で Pillow により生成（PNG/JPEG/WebP 1×1〜64×64、破損 PNG はヘッダ切断、画素超過は IHDR 寸法を偽装した PNG バイト列で構築し、巨大画像を実際に生成・展開しない）。リポジトリにバイナリを追加しない。
- **収集パターン**: BE は `-k "REQ-427 and AC-n"`（marker `@getattr(pytest.mark, "REQ-427")` と `@getattr(pytest.mark, "AC-n")`、docstring 先頭 `[REQ-427/AC-n]`）。FE は `-t "REQ-427/AC-n"`（`it('[REQ-427/AC-n] ...')`）。E2E は `test('[REQ-427/AC-3] ...')`。
- **収集要件**: 選択集合 S は本書 §4 の全ケース ID。S ⊆ 収集 C、S の全件 PASS、空収集・重複 ID・未知 AC タグ・未承認 skip/xfail は不合格。
- **凍結候補**: Gate 2/3 は最終レビュー済み候補（コミット SHA または tree hash）で新規実行し、記録に候補識別子を残す。

---

## 4. AC トレーサビリティ・テストケースマトリクス

### AC-1: 標準 `input_type: 'image'` の選択・保存・保持
| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| AC1-FE-1 | integration | `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | `[REQ-427/AC-1] 入力型の標準型 optgroup に image が表示されカスタム型とは別に選択できる` |
| AC1-FE-2 | integration | 同上 | `[REQ-427/AC-1] image を選んで作成・編集保存すると onSave の input_type が 'image' になる` |
| AC1-FE-3 | integration | 同上 | `[REQ-427/AC-1] input_type が image の既存マスタを開くと image が選択状態で表示される`（再読み込み後の保持） |
| AC1-BE-1 | integration | `backend/tests/integration/api/test_workflows.py` | `[REQ-427/AC-1] POST /api/mapping-masters で input_type image を作成し GET で image が返る` |
| AC1-BE-2 | integration | 同上 | `[REQ-427/AC-1] PUT で textarea から image へ変更し GET で保持される（ParamTypeMaster は作成されない）` |

### AC-2: `ref_image` 初期定義と `LoadImage` 候補検出
| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| AC2-BE-1 | integration | `test_workflows.py` | `[REQ-427/AC-2] seed_initial_data が ref_image master(input_type image) と LoadImage×image の RuleSet・main variant を作る` |
| AC2-BE-2 | integration | 同上 | `[REQ-427/AC-2] seed_initial_data を2回実行しても ref_image の master/rule/variant が重複しない` |
| AC2-BE-3 | integration | 同上 | `[REQ-427/AC-2] /api/workflows/scan が既定タイトル Load Image の LoadImage ノードを ref_image 候補として返す` |
| AC2-BE-4 | integration | 同上 | `[REQ-427/AC-2] LoadImage が2つある workflow は duplicated 警告で全候補 node_ids を返す` |
| AC2-BE-5 | integration | 同上 | `[REQ-427/AC-2] POST /api/workflows で ref_image マッピングを保存し GET の mappings に input_type image で返る` |
| AC2-BE-6 | integration | 同上 | `[REQ-427/AC-2] 別 master の variant が role ref_image を既に持つ場合 seed は衝突せずスキップし起動処理が例外を出さない` |

### AC-3: Generate パラメータパネルの表示と UI 不変条件
| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| AC3-FE-1 | integration | `frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx` | `[REQ-427/AC-3] Desktop で image マッピングのラベル・選択ボタン・アップロードボタン・サムネイルが表示される` |
| AC3-FE-2 | integration | 同上 | `[REQ-427/AC-3] Mobile(mobile=true) でも同一要素が表示され操作ボタンが min-h-11/min-w-11 または hit-slop を持つ` |
| AC3-FE-3 | integration | 同上 | `[REQ-427/AC-3] 値が未指定のとき未指定プレースホルダーを表示しトークン値ならサムネイル URL を表示する` |
| AC3-E2E-1 | e2e | `frontend/e2e/generateParamImageField.spec.ts` | `[REQ-427/AC-3] 360px 幅で画像入力欄が横はみ出しせず全ボタンが 44x44px 以上` |
| AC3-E2E-2 | e2e | 同上 | `[REQ-427/AC-3] 1280px 幅で画像入力欄とサムネイルが表示され選択モーダルが中央表示、360px ではボトムシート表示` |
| AC3-ST-1 | unit（静的） | `scripts/verify_ui_invariants.py` | 新規コンポーネントで違反 0 件 |

### AC-4: 履歴・スナップショットからの選択
| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| AC4-BE-1 | integration | `backend/tests/integration/api/test_ref_images.py` | `[REQ-427/AC-4] history import は ComfyUI /view 原本を取り込み RefImageRead を返す` |
| AC4-BE-2 | integration | 同上 | `[REQ-427/AC-4] history import は /view 404 のとき full_cache の WebP から取り込む` |
| AC4-BE-3 | integration | 同上 | `[REQ-427/AC-4] snapshot import は snapshot_dir の画像を取り込み存在しない snapshot は 404` |
| AC4-BE-4 | integration | 同上 | `[REQ-427/AC-4] 同一画像を2回 import すると同じ token を返しファイルは1つ` |
| AC4-FE-1 | integration | `frontend/src/components/__tests__/RefImagePickerModal.test.tsx` | `[REQ-427/AC-4] 生成履歴タブの画像を選ぶと history import が filename/subfolder/type で呼ばれ onSelected が呼ばれる` |
| AC4-FE-2 | integration | 同上 | `[REQ-427/AC-4] スナップショットタブの画像を選ぶと snapshot import が呼ばれ onSelected が呼ばれる` |
| AC4-FE-3 | integration | `frontend/src/components/__tests__/ImageParamField.test.tsx` | `[REQ-427/AC-4] モーダルで選択すると onChange に token が渡りサムネイル src が即時更新される` |

### AC-5: アップロード / D&D / ペースト / エラー時保持
| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| AC5-BE-1 | unit | `backend/tests/unit/test_ref_image_store.py` | `[REQ-427/AC-5] PNG/JPEG/WebP を保存すると sha256 名で原本バイト列が保存されサムネイルが作られる` |
| AC5-BE-2 | unit | 同上 | `[REQ-427/AC-5] 非画像・破損画像・GIF は 415、0 byte は 422、上限超過バイト・画素は 413` |
| AC5-BE-3 | unit | 同上 | `[REQ-427/AC-5] parse_ref_token は C1 完全一致の文字列だけを受理する（Hypothesis PBT）` |
| AC5-BE-4 | integration | `test_ref_images.py` | `[REQ-427/AC-5] POST /api/ref-images/upload は 201 RefImageRead を返し GET 原本・サムネイルが取得できる` |
| AC5-BE-5 | integration | 同上 | `[REQ-427/AC-5] upload の 415/413/422 はエラーコード付きで返りストアにファイルが増えない` |
| AC5-FE-1 | integration | `ImageParamField.test.tsx` | `[REQ-427/AC-5] ファイル選択アップロード成功で onChange(token) とサムネイル更新` |
| AC5-FE-2 | integration | 同上 | `[REQ-427/AC-5] 画像ファイルのドロップでアップロードされ値が更新される` |
| AC5-FE-3 | integration | 同上 | `[REQ-427/AC-5] フォーカス中のペーストで画像がアップロードされ値が更新される` |
| AC5-FE-4 | integration | 同上 | `[REQ-427/AC-5] 非画像ファイルはアップロードせずエラー表示し既存値とサムネイルを保持する` |
| AC5-FE-5 | integration | 同上 | `[REQ-427/AC-5] サーバー 500/通信失敗でエラー通知し onChange を呼ばず既存サムネイルを保持する` |
| AC5-FE-6 | unit | `frontend/src/utils/__tests__/refImage.test.ts` | `[REQ-427/AC-5] isRefImageToken は BE と同じ判定をする（fast-check PBT）` |

---

## 4-2. AC トレーサビリティ（続き: AC-6〜AC-8 と GC）

### AC-6: 生成時の ComfyUI 供給と未指定時の非上書き
| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| AC6-FE-1 | unit | `frontend/src/utils/__tests__/workflowParamInjector.test.ts` | `[REQ-427/AC-6] image マッピングにトークンがあると対象ノード入力へトークンを注入する` |
| AC6-FE-2 | unit | 同上 | `[REQ-427/AC-6] 値が空・非トークンのとき対象ノード入力は元 JSON の値のまま` |
| AC6-FE-3 | unit | 同上 | `[REQ-427/AC-6] getInitialParams は入力がトークンなら値、通常ファイル名なら空文字を返す` |
| AC6-BE-1 | integration | `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | `[REQ-427/AC-6] upload_image は /upload/image へ multipart(type=input, overwrite=true, subfolder) を送り name/subfolder を返す` |
| AC6-BE-2 | integration | 同上 | `[REQ-427/AC-6] upload_image は name 欠落・非JSON 応答で UpstreamResponseError` |
| AC6-BE-3 | scenario | `backend/tests/integration/legacy/test_generation_service.py` | `[REQ-427/AC-6] トークン付き graph は upload 後に subfolder/name へ置換して submit される` |
| AC6-BE-4 | scenario | 同上 | `[REQ-427/AC-6] トークン無し graph は upload を呼ばず従来どおり submit される` |
| AC6-BE-5 | integration | 同上 | `[REQ-427/AC-6] ストアに無いトークンは受付時 422 ref_image_not_found で job を作らない` |
| AC6-BE-6 | scenario | 同上 | `[REQ-427/AC-6] upload 失敗（例外・503・不正応答）で job は failed になり submit は呼ばれない` |
| AC6-BE-7 | unit | 同上 | `[REQ-427/AC-6] collect_ref_ids/replace_ref_tokens はトークンのみ置換し非トークン値・リンク配列・入力 graph を変えない（Hypothesis PBT）` |

### AC-7: 無効化時の非表示・非注入と再有効化
| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| AC7-FE-1 | integration | `workflowParamInjector.test.ts` | `[REQ-427/AC-7] mapping_slot_states が false の image マッピングは generationWorkflow で除外され注入されず raw mappings は保持される` |
| AC7-FE-2 | integration | 同上 | `[REQ-427/AC-7] variantEnabled false の image マッピングも除外され、true に戻すと再び注入される` |
| AC7-FE-3 | integration | `ParamPanel.test.tsx` | `[REQ-427/AC-7] 無効化された image マッピングは入力欄が表示されず再有効化で再表示される` |

### AC-8: プリセット・Multi-Set・履歴復元
| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| AC8-BE-1 | integration | `backend/tests/integration/api/test_presets.py` | `[REQ-427/AC-8] ref_image role のトークン値がプリセット保存・再取得で同一文字列のまま往復する` |
| AC8-BE-2 | integration | `backend/tests/integration/api/test_snapshots.py` | `[REQ-427/AC-8] Snapshot.params のトークン値が保存・取得で保持される` |
| AC8-FE-1 | integration | `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts` | `[REQ-427/AC-8] loadSnapshotParams はトークン値を image role の入力値として復元する` |
| AC8-FE-2 | unit | `frontend/src/utils/__tests__/generationRecord.test.ts` | `[REQ-427/AC-8] 生成記録の parameters に image フィールドがトークン値で記録される` |
| AC8-FE-3 | integration | `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | `[REQ-427/AC-8] Multi-Set 生成で各セットの image トークンがそれぞれの graph と param_values に入る` |
| AC8-FE-4 | integration | `ParamPanel.test.tsx` | `[REQ-427/AC-8] paramValues の切替（プリセット切替相当）でサムネイルが切替後のトークンに追従する` |
| AC8-FE-5 | integration | `ParamPanel.test.tsx` | `[REQ-427/AC-8] サムネイル取得失敗（GC 削除済み 404 相当）でもプレビュー不可表示のみで値を保持する` |

---

## 4-3. プロファイル一括編集での image 型（T6。提案 AC-10、暫定紐付け AC-3/4/5/8）

現 PBI の AC-1〜8 の範囲外のため、AC-10 として追加を提案中。それまでは下表の AC タグへ暫定的に紐付ける。

| ID | Tier | ファイル | ケース名 |
|---|---|---|---|
| BE-1 | integration | `frontend/src/components/__tests__/ProfileBulkEditModal.test.tsx` | `[REQ-427/AC-3] 一括編集のパラメータタブで image ロールが画像欄（選択・アップロード・未指定表示）として表示されテキスト入力にならない` |
| BE-2 | integration | 同上 | `[REQ-427/AC-3] チェック OFF では画像欄が操作不可で ON で操作可能になる` |
| BE-3 | integration | 同上 | `[REQ-427/AC-5] 画像を選択して適用すると payload.paramPatch に同一トークンが入る` |
| BE-4 | integration | 同上 | `[REQ-427/AC-5] 画像未選択のまま適用しても当該ロールは payload に含まれず変更されない` |
| BE-5 | integration | 同上 | `[REQ-427/AC-5] アップロード失敗時はエラー表示し直前の選択画像とプレビューを保持する` |
| BE-6 | integration | 同上 | `[REQ-427/AC-4] ピッカー表示中の Escape はピッカーのみ閉じ一括編集モーダルは閉じない` |
| BE-7 | integration | `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts` | `[REQ-427/AC-8] 一括適用で選択中の複数プリセットの image ロールへ同一トークンが保存され他ロールは不変` |
| BE-8 | integration | 同上 | `[REQ-427/AC-8] 一部プリセットの保存失敗時は既存規則どおり通知し、再適用で同一トークンに揃う` |
| BE-E2E-1 | e2e | `frontend/e2e/profileBulkEditImage.spec.ts` | `[REQ-427/AC-3] 360px で一括編集の画像欄が横はみ出しせず操作領域 44px 以上、ピッカーが前面表示され Escape でピッカーのみ閉じる` |
| BE-E2E-2 | e2e | 同上 | `[REQ-427/AC-8] 1280px で画像を選択し 2 件のプリセットへ適用すると 2 件の PUT に同一トークンが入る` |

---

## 4-4. AC トレーサビリティ（続き: GC）

### GC（参照画像の自動クリーンアップ。AC-8 の保護として紐付け）
ファイル: `backend/tests/integration/services/test_ref_image_gc.py`（新設モジュール `ref_image_gc` に対応）。すべて `[REQ-427/AC-8]`、テスト DB（conftest の in-memory SQLite）と tmp ストアの実ファイルを使い、時刻は `run_gc(now=...)`、mtime は `os.utime` で設定する。

| ID | Tier | ケース名 |
|---|---|---|
| GC-1 | integration | `[REQ-427/AC-8] GC は未参照かつ猶予超過の原本とサムネイルを削除し GcReport に記録する`（正常） |
| GC-2 | integration | `[REQ-427/AC-8] GC は猶予期間内（mtime 72 時間以内）の未参照画像を削除しない` |
| GC-3 | integration | `[REQ-427/AC-8] GC はプリセット値・プリセット予約 JSON・Snapshot.params・prompt_metadata・generation_jobs.graph_json・workflows.json_body・workflow_history から参照される猶予超過画像を削除しない`（保存場所ごとのパラメータ化） |
| GC-4 | integration | `[REQ-427/AC-8] collect_db_references は Base.metadata の全テーブルを走査対象に含める`（列挙漏れ防止） |
| GC-5 | integration | `[REQ-427/AC-8] ORM に無いテーブル（CREATE TABLE future_x）のトークンも参照として収集する`（将来の保存場所） |
| GC-6 | unit | `[REQ-427/AC-8] 任意の JSON 入れ子・多重エンコード文字列に埋め込んだトークンが部分一致で抽出される`（Hypothesis PBT） |
| GC-7 | integration | `[REQ-427/AC-8] テーブル読み取りが例外を送出すると GC は 1 件も削除せず aborted を返す`（fail-safe） |
| GC-8 | integration | `[REQ-427/AC-8] 2 回目の参照収集が失敗すると削除しない`（fail-safe） |
| GC-9 | integration | `[REQ-427/AC-8] 2 回目の収集までに参照が追加された候補は削除しない` |
| GC-10 | integration | `[REQ-427/AC-8] 候補決定後・削除前に touch された画像はロック下の mtime 再確認で削除しない`（並行） |
| GC-11 | integration | `[REQ-427/AC-8] 不正名ファイル・サブディレクトリ・新しい .tmp_* は触らず、1 時間超の .tmp_* だけ削除する`（シンボリックリンクは Windows の作成権限に依存するため Gate 3 の RT-17 で確認） |
| GC-12 | integration | `[REQ-427/AC-8] ストアルートが無い場合は中止し例外を外へ出さない` |
| GC-13 | integration | `[REQ-427/AC-8] 同一内容の再アップロード・GET サムネイルで mtime が更新され猶予が延長される`（touch、GET は 1 時間抑制、`Cache-Control: public, max-age=86400`。`test_ref_images.py`、T1） |
| GC-14 | integration | `[REQ-427/AC-8] 1 回の削除は上限 500 件で残りは次回に削除される` |
| GC-15 | integration | `[REQ-427/AC-8] gc_loop は run_gc の例外をログのみとして継続し、cancel で終了する` |
| GC-16 | scenario | `[REQ-427/AC-8] GC で削除済みのトークンを含む生成要求は 422 ref_image_not_found となり、受付時の claim で touch された画像は GC 対象にならない`（`test_generation_service.py`、T3） |

---

## 5. Red Team 境界値・異常系シナリオ（Gate 3）

| ID | シナリオ | 期待 |
|---|---|---|
| RT-1 | history import に `filename="../../etc/passwd"`、`subfolder="..\\x"`、`type="input"` | 422、ComfyUI へ通信しない、ストア不変 |
| RT-2 | `GET /api/ref-images/..%2F..%2Fprompt_surgeon.db` や 63 桁 hex | 404、ストア外ファイルを返さない |
| RT-3 | 拡張子 `.png` だが中身が JPEG / テキスト | JPEG は `jpg` トークン、テキストは 415（拡張子・Content-Type を信用しない） |
| RT-4 | 20 MiB + 1 byte、画素数 5,000 万超（ヘッダ偽装含む） | 413、メモリ上で全展開しない |
| RT-5 | 同一画像の並行 upload 2 件 | 両方 201・同一トークン・ファイル 1 つ・tmp 残骸なし |
| RT-6 | 受付後・worker 実行前にストアのファイルを削除 | job `failed`（参照画像が見つかりません）、`/prompt` 非送信 |
| RT-7 | `/upload/image` がタイムアウト | job `failed`、`unconfirmed` にしない、自動再送しない |
| RT-8 | graph に `"refimg:<64hex>.png "`（末尾空白）・大文字 hex・`refimg:` を含む長文プロンプト | 置換しない（完全一致のみ） |
| RT-9 | 同一 request の replay（ストアから画像削除後） | 既存の受付結果を返し 422 にしない |
| RT-10 | FE: 2 回連続アップロードで 1 回目の応答が後着 | 最後の操作の結果のみ反映 |
| RT-11 | FE: ペーストをフィールド外で実行 | アップロードしない（グローバル paste を横取りしない） |
| RT-12 | FE: 画像欄の値が非トークン文字列（旧データ・手入力） | 未指定表示、生成時は非上書き |
| RT-13 | seed role 衝突 DB で起動 | 起動成功、warning ログ、既存 variant 不変 |
| RT-14 | ParamSync slave の image 欄 | disabled 表示、操作不可 |
| RT-15 | GC 実行中（収集〜削除の間）に同じ画像をアップロードし直す・生成受付する | 削除されない（ロック下 mtime 再確認）、生成は成功 |
| RT-16 | DB の一部テーブルが破損・ロックで読めない | GC は削除 0 件で中止、warning 1 回、アプリは継続 |
| RT-17 | ストアに `../` を含む名前のシンボリックリンク、`README.txt`、大文字 hex 名、`thumbs/sub/` を置く | GC は一切触らない |
| RT-18 | 起動直後に GC が失敗する（ストアルート作成不可） | 起動・生成・API は影響を受けない |
| RT-19 | 一括編集でチェック ON・画像選択後にチェック OFF にして適用 | image ロールは変更されない（チェック OFF は「変更しない」） |
| RT-20 | 一括編集で画像 A を選択 → 画像 B のアップロードが失敗 → 適用 | 全対象へ画像 A のトークンが適用され、B の残骸トークンは入らない |
| RT-21 | 一括編集で画像選択中に別端末が対象プリセットを更新 | 既存の一括適用規則（対象は最新キャッシュ、PUT 応答で同期）に従い、image ロールのみ上書きされ他ロールは保持 |
| RT-22 | 一括編集のピッカー表示中に Escape を連打 | 1 回目でピッカーのみ閉じ、2 回目で一括編集モーダルが閉じる（二重クローズ・未適用データ消失なし） |

---

## 6. Mandatory Full-Suite Fallback 条件

以下のいずれか（OR）に該当する場合、V1 のフルスイート探索（Gate 2）を最終候補で新規実行する。本 PBI は high リスクのため、Gate 2 フルスイートは**常に必須**である。

- 公開契約（OpenAPI、`/api/ref-images`、`GenerationService` 引数）、共有フィクスチャ（`conftest.py`）、依存関係、seed／マスタデータ、生成 worker のいずれかに変更がある（本 PBI は該当）。
- 収集件数の不一致、空収集、予期しない skip/xfail、未知 AC タグ、重複 ID。
- semantic／mock／coverage 欠陥（内部ロジックの monkeypatch、トートロジー assert、`refImagesApi` のモジュールモック）。
- フレーキーなテスト、Playwright の再試行依存。
- カード間で選択範囲の妥当性が証明できない（T3 と T4 の並列成果物の統合後など）。
- リスク・環境が不明（ComfyUI 実体・LM Studio・GPU 状態に依存する結果が混入した場合を含む）。不明は low に丸めない。
