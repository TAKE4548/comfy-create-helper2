---
id: REQ-296-test-plan
title: "セリフ一括生成 VLM出力・LM Studio解放 テスト計画"
status: test-plan
tags: [test, backend, speech, vlm, lm-studio]
related_paths:
  - backend/tests/test_speech_draft.py
  - backend/tests/test_speech_scene_service.py
  - backend/tests/test_speech_scene_router.py
  - backend/tests/test_lm_studio_lifecycle.py
---

# REQ-296 テスト計画

## 用語と判定契約

- 実行前提: リポジトリルートの既存 `backend\.venv` と `backend\requirements.txt` を使う。アプリ設定は既存の `.env`/ユーザー設定から読み、テスト計画の実行で設定値を変更しない。実行時PythonはこのworkspaceのPython 3.12。テストでは `backend\.venv\Scripts\python` を明示し、ルートで `mypy backend` を実行する。
- `T1`〜`T6` は `docs/backlog/task/active/REQ-296-T*.md` のタスクカードIDであり、テスト種類の略号ではない。局所確認は後述するpytestコマンドで実行し、実LM Studio確認は Gate 3 の手順に従う。テスト実行や証拠確認をモデルの推測に置き換えない。
- VLM入力JSON Schemaの正常例: `{"scene_interpretation":"窓辺に立つ人物","items":[{"role":"main","speaker":"主人公","text":"いい天気だね","position":"top_left"}]}`。余分なキーを認めず、itemsは1件以上。
- 正常結果は `backend/app/schemas/speech.py` の `GeneratedSpeechBubbleRead` 配列へ変換する。各要素は `id`, `text`, `role`, `speaker_name`, `speaker_tag_set_id`, `is_se`, `position{x,y,w,h}`, `tail`, `style` を持つ。position値は1024基準px。
- `readiness retry` の開始点は、対象モデルのinstance ID回収後、Chat CompletionsがHTTP 400とJSON本文`{"error":"Model is unloaded."}`を返した時点。これ以外の400では開始しない。時間切れ時はHTTP 503、`error_kind=lm_studio_instance_not_ready` の制御応答とし、生のLM Studio本文は返さない。
- 4/60/90/120秒の各制限はasyncio event loopのmonotonic elapsed timeで計測する。walkthroughの日時は実行者のローカル時刻Asia/Tokyoで記録する。
- `walkthrough.md` はテスト計画本文ではなく、ルートの `walkthrough.md` にある実行証拠記録。Gate 3実行前に、現行コードによる実サービス証拠と開始/終了時のロード状態を記録する。

## AC対応と局所テスト

| AC | 観測条件 | 対象 |
|---|---|---|
| AC-1 | scene専用リクエストのsystem/userが同じJSONセリフ生成を指示し、JPEGと`response_format.json_schema`を送る。外側は`scene_interpretation`文字列と空でない`items`配列のみ。各itemは`role` (`main`/`sub`/`se`)、`speaker`文字列、`text`文字列、`position` (`top_right`/`center_right`/`center`/`top_left`/`bottom_left`) のみを持つ。正常JSONを既存吹き出しへ変換する。旧画像説明APIの応答契約は維持する。 | T1、T2 |
| AC-2 | 空本文、非JSON、items空/型不正、必須項目欠落、未知role/position、`finish_reason=length`/`content_filter`、choices欠落を分類し、JSON APIとstreamで制御された応答にする。本文・画像・プロンプトをログ/APIへ出さない。 | T1、T2、T5 |
| AC-3 | list/unload各4秒、load request/whole operation最大120秒。既存1インスタンスまたは明示loadの返却IDをChat Completionsの`model`とunload本文の双方に使う。ReadTimeout/期限超過後は最大20秒・1秒間隔で一覧照会し、回収した単一IDも同じ経路で解放する。Chat Completionsが厳密にHTTP 400 `{"error":"Model is unloaded."}` を返すときだけ、同一ID・同一要求を最大90秒・1秒間隔で再試行する。readiness開始後は各POSTを最大60秒(残りdeadlineでcap)、ReadTimeoutもdeadline内で再試行する。他の400/先行transport失敗は再試行しない。unloadが非2xxでも、一覧で対象IDの不在を確認できれば解放済み。正常・推論エラー・キャンセルで応答ID一致とlist再照会での消失を確認する。 | T1、T3、T4 |
| AC-4 | 未対応パスが200で返る、本文ID不一致、listで残存、通信失敗、複数インスタンスを成功扱いしない。元の推論失敗と解放失敗を個別に診断する。 | T3、T4、T5 |
| AC-5 | REQ-291設計・テスト計画・SPEC_HISTORYの古い契約を同期し、局所回帰を通す。 | 全体 |

## テストデータと期待値

1. 制御再現: HTTP 200、`finish_reason=stop`、Markdown画像説明文。`vlm_invalid_json` の制御エラー。HTTP 500なし。返答本文は診断ログに出さない。
2. 正常例: `scene_interpretation` と `items[0]` の5必須項目を含むJSON。既存のrole/position変換が継続し、検証済みアンロード後に `vram_unloaded=true`。
3. 境界例: `finish_reason=length` と部分JSON、`finish_reason=content_filter`、`finish_reason` 欠落、`content=null`、`choices=[]`、`items=[]`、未知position。長さ/拒否/空/JSON/スキーマの原因別コードを確認する。
4. LM Studio契約: `llm_base_url=http://localhost:1234/v1` から `/api/v1/models` と `/api/v1/models/unload` を使用し、`{"instance_id": <取得ID>}` を送る。HTTP 200のHTML/本文不一致、正常応答だがloaded_instancesに残る、再照会不能をFalseとする。
5. ライフサイクル: 推論前load、推論中エラー、推論中キャンセル、同時リクエストを模擬する。後処理完了後にのみresultを返し、元エラーの分類を失わない。
6. 対象一致: モデルキーとinstance IDが異なるfixtureで、Chat Completionsの `model` とunload本文がともに取得IDとなることを確認する。ID指定をLM Studioが拒否する場合はキーへフォールバックせず、制御エラーとして対象IDの解放を試みる。
7. コールドスタート: listは短いタイムアウトのまま、`POST /api/v1/models/load` だけ応答待ちと処理全体の最大120秒を使う。4秒を超えて応答した正常loadのIDを返す。loadがReadTimeoutまたは全体期限超過になった後に一覧で同モデルキーの単一IDを確認できれば、そのIDを返し後続の解放で使用する。照会中にまだ0件なら最大20秒・1秒間隔で再照会し、期限内に見つからない/複数件/ID欠落なら制御エラーにする。タイムアウト後にloadを再送しない。
8. Readiness race: LM Studioの`loaded_instances` entryは`id`と`config`のみでready状態を持たない。timeout後に回収したIDの最初のChat Completionsが厳密なHTTP 400 `{"error":"Model is unloaded."}` の場合、1秒間隔で最大90秒同じID・同じ画像/schema requestを再試行する。readiness開始後は各POST最大60秒 (残りdeadlineでcap)、その後ReadTimeoutも残り時間内で再試行する。期限までに正常推論またはsafe `LM_STUDIO_INSTANCE_NOT_READY` を確認する。load再送・ID変更をしない。他のHTTP 400とreadiness開始前の通信失敗は再試行しない。失敗時のcleanupではunload statusにかかわらず対象IDをlist再照会し、ID不在なら解放済み、残存/照会不能なら未解放とする。異常2xx応答は失敗のまま。

## 設計段階の局所実現性プローブ

モデルキー `qwen3.5-9b-claude-4.6-highiq-instruct-heretic-uncensored` を別名ID `req296-instance-probe` でロードし、`model=req296-instance-probe`、`Reply with exactly OK.`、`max_tokens=2` のChat CompletionsがHTTP 200、`finish_reason=stop`、`OK` を返した。対象IDのアンロード後、モデル一覧のロード済みインスタンスは0件。テキスト推論の別名ID指定は確認済み。画像付き構造化JSONの実サービスGate 3結果はルート `walkthrough.md` に記録する。

## Gate 3 walkthroughへ引き継ぐ失敗証拠

2026-09-30の初回コールドスタート確認では、sceneサービスの `POST /api/v1/models/load` が当時の4秒タイムアウトで `ReadTimeout` となり、生成が失敗した。LM Studioではその後モデルのロードが完了した。この履歴は「ロード失敗」ではなく「loadのHTTP応答が期限内に返らなかった結果不明」であり、IDが回収できれば同じ要求の後処理で解放する必要があることを示す。修復後の再検証証拠と最終Gate判定は [`walkthrough.md`](../../walkthrough.md) に記録する。

実行日は 2026-09-30 (Asia/Tokyo)。相対リンク `../../walkthrough.md` は `docs/design/REQ-296-test-plan.md` からリポジトリルートの `walkthrough.md` を指す。

## 実行コマンド（Engineer/QA向け。設計段階では未実行）

- ルートで型検査: `mypy backend`。成功条件: exit code 0。
- ルートから局所テスト: `Set-Location backend; $env:LOG_DIR='.test-logs'; .\.venv\Scripts\python -m pytest tests/test_speech_draft.py tests/test_speech_scene_service.py tests/test_lm_studio_lifecycle.py tests/test_speech_scene_router.py -q`。成功条件: exit code 0、全件passed。
- ルートからGate 2全体: `Set-Location backend; $env:LOG_DIR='.test-logs'; .\.venv\Scripts\python -m pytest -q`。成功条件: exit code 0、全件passed。`.test-logs` はsandboxで既定ログ先に書けない場合だけ使うworkspace内ログ先。

## Gate 3 手動確認

Gate 3は、隔離テストDBとテスト画像を使い、現行sceneサービスを実LM Studioへ接続して実行する。開始前に対象モデルの`loaded_instances=[]`を確認し、`generate_scene_script`を呼ぶ。Chat Completionsが画像とstrict JSON Schemaを受理し、`scene_interpretation`文字列と1件以上のitemが既存形式へ変換されること、サービス結果の`vram_unloaded=true`、終了後の`GET /api/v1/models`でロード済み総数が0件であることをすべて確認できれば通常cold-start PASS。一つでも満たさなければFAILとし、HTTP statusと許可された安全なエラーコード、model list状態を記録する。さらにプロセス内だけload timeoutを5秒へ短縮してReadTimeout回収経路を強制し、同じIDのreadiness retryを最大90秒実行する。各後続POSTは最大60秒 (残りdeadlineでcap) とし、ReadTimeoutも残り時間内で1秒間隔再試行し、正常生成・確認解放または`LM_STUDIO_INSTANCE_NOT_READY`・対象ID不在を確認する。timeout後のload再送とID変更がないことを確認する。元の22:11応答は保存されていないため、その本文の再現一致は検証対象にしない。

コールドスタートでは事前に対象モデルの `loaded_instances=[]` を確認する。実ロードに4秒を超えてもシーン生成が途中で失敗せず、返却後に対象IDが一覧から消えることを確認する。120秒のロード待機を超えるケースは、応答タイムアウト直後の一覧再照会でIDを回収して解放する経路と、回収不能として安全に失敗する経路を分けて記録する。
