# 障害調査報告書 (Incident Report)

## 障害概要
1. 生成画面にて「Batch Size」を 2 以上に設定して生成を行っても、ComfyUI に対する生成リクエストが1回しか送信されない。
2. 自身が画像生成を開始し「生成待機中 / 生成中」の状態になると、生成ボタン（Generate Batch）が非活性（disabled）になり、ComfyUI のサーバー側キューに後続の生成ジョブを追加（キューイング）することができない。

## 再現手順
1. アプリケーションの生成画面を開く。
2. パラメータ設定領域で `Batch Size` を `3` などの 2 以上の値に設定する。
3. 「Generate Batch」ボタンをクリックする.
4. ネットワーク通信（`/prompt` へのリクエスト）が 1 回しか行われていないことを確認する。
5. 生成処理が開始されると、「Generate Batch」ボタンがグレーアウトされ、クリックできなくなることを確認する。

## 根本原因 (Root Cause Analysis)
1. **バッチサイズに対するループ処理の実装漏れ**:
   * [GeneratePage.tsx (L416-L455)](../frontend/src/pages/GeneratePage.tsx#L416-L455) の `handleGenerate` 関数において、`batchSize` パラメータが取得されているものの、それに基づいたループ処理（複数回のリクエスト送信）が実装されておらず、単一の `await queuePrompt(wfJson)` のみ実行されているため。
   * また、複数回送信するにあたって、シード値（`seedMode` が `random` の場合は毎回乱数、`fixed` の場合はインクリメントなど）を各リクエストごとに動的に変更する制御も存在しないため。

2. **自セッション生成中のボタン無効化条件**:
   * [GeneratePage.tsx (L1053, L1682)](../frontend/src/pages/GeneratePage.tsx#L1053) において、ボタンの無効化条件が `disabled={(isGenerating && activeClientId === clientId) || !selectedWorkflowId}` となっており、自セッションが生成中の場合にボタンを無効化するロジックになっているため。
   * 本来 ComfyUI はキュー（Queue）による非同期並行処理をサポートしており、自身が生成中であっても後続のジョブをキューに順次投入できる設計にすべきであるが、UI側で不当に制限がかかっている。

## 障害分類
* **分類**: **Type A (Implementation Bug / 実装バグ・仕様不一致)**
  * 設計書 `docs/design/REQ-009.md` の「他セッションのジョブが実行されている間でも、ComfyUI のキューに順次投入されるため『Generate Batch』ボタンは無効化せず、そのままキューイング可能」という基本方針に対し、自セッションの生成中のみ無効化されるという実装の不整合が生じているため。

## 対策方針（※調査フェーズのため実装は行いません）
1. `handleGenerate` 内で `batchSize` の数だけループし、各ループごとにシード値を更新（ランダム時は再生成、固定時は +1 ずつインクリメント等）した上で `queuePrompt` を送信する。
2. 生成ボタンの無効化条件から自セッションの生成中判定（`isGenerating && activeClientId === clientId`）を除外し、ワークフローの選択状態や接続状態のみに基づいて活性・非活性を制御する。
