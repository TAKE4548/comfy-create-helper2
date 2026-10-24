---
title: REQ-380 文書設計 — ComfyUIメモリ解放の管理・外部連携契約
tags:
  - REQ-380
  - settings
  - service-management
  - document-design
related_paths:
  - docs/backlog/pbi/active/REQ-380.md
  - docs/design/REQ-380.md
  - docs/design/REQ-380-test-plan.md
  - docs/backlog/task/active/REQ-380-T4.md
  - docs/specs/SPEC_SETTINGS.md
  - docs/specs/server_manager_guide.md
---

# REQ-380 文書設計

## Purpose and Readers

設定画面でComfyUIのVRAMを空けたい利用者、Web Managerの運用者、外部スクリプトの作成者に、操作経路・実行可能条件・結果の意味を説明する。設定画面の規範は `SPEC_SETTINGS.md`、管理APIと外部ツールの運用は `server_manager_guide.md` を正本とする。コードのAPI契約と状態遷移は統合設計 `REQ-380.md` に合わせる。

## Before and After Meaning

現行文書はサービスの起動・停止・再起動とログ確認を説明するが、プロセスを維持したメモリ解放操作を定めていない。変更後は、SettingsのsystemタブとWeb ManagerのComfyUI行からメモリ解放を要求できる条件、非活性理由、受付通知と実空き容量の確認方法を明記する。

外部プロセスは本ツールの8000/8899番を必須とせず、ComfyUIのネイティブAPIを直接使う。設定画面・スマートフォンの通常運用で8188番の公開を要求する意味には変更しない。

## Normative Contract

| 項目 | 同期する契約 |
|---|---|
| UI経路 | 同一ホストの8899番Web Managerへ既存 `POST /api/action`、本文は `{ "action": "free-memory", "service": "comfy" }`。8000番にメモリ解放proxyは設けない。 |
| Managerの宛先 | 固定host `127.0.0.1` と既存設定 `wsl.port` を用いる。サービス停止・再起動やPowerShell/subprocessによる実行へ置き換えない。 |
| 状態 | ComfyUI状態に `execution_state`（`idle` / `executing` / `queued` / `unknown`）、`queue_running` / `queue_pending`（numberまたはnull）、任意の `execution_error` を追加する。 |
| 状態の判定 | `GET /queue` のrunning非空はexecuting、pendingのみ非空はqueued、双方空はidle。停止・取得失敗・不正応答はunknownとし、死活のLISTENと区別する。 |
| 有効条件 | LISTENかつidleかつ操作なしの場合だけ有効。生成中、待機ジョブあり、停止中、状態不明、操作中には非活性と理由を表示する。受付後も最新の状態取得でidleを確認できるまで非活性を保つ。 |
| 送信前の保護 | Managerが既存global action lockを確保し、cacheを使わず直前に `/queue` を確認する。idle時のみ `POST /free` に `{ "unload_models": true, "free_memory": true }` を送る。 |
| 成功の意味 | ComfyUIネイティブ `/free` の空本文HTTP 200も要求受付として扱い、Managerは `/api/action` のJSON応答に包んでUIへ返す。通知は解放要求の受付を表し、物理的な解放完了・全GPUメモリ解放を断定しない。 |
| 拒否・失敗 | 400=対象service不正、409=busy/queued/executing、503=停止/queue不明では `request_sent:false`。502=upstream非2xx。504/通信断では送信成否を断定しない。 |
| 再取得 | 同じaction POSTとupstream `/free` POSTは再送しない。timeout・通信断・応答不明では結果未確認を示す一方、通常のGET状態/VRAM取得・ポーリングとWS監視は継続する。 |
| VRAMの確認 | 受付後の実空き容量は既存の2.5秒周期WS監視（5秒以内）で確認する。WS断時はSettingsのVRAM再取得経路を使い、取得失敗を既存監視エラーとして通知する。受付直後は以前の値や高い使用量が観測される場合があり、その値だけで物理解放完了・失敗を断定したりPOSTを再送したりしない。 |
| 外部ツール | `http://127.0.0.1:8188/free` を直接呼び出す例を載せる。呼出し元がネイティブ `/queue` のidleを確認する。本ツールのUI/Manager guardを経由しない。 |
| 性能の取引 | モデルをアンロードすると次回生成でモデル再ロードを要する。解放される量はComfyUIや他プロセスの状態に依存する。 |

## Owned Documents and Edits

### SPEC_SETTINGS.md

- 機能一覧、§3のsystemサービス行、§3-1の操作・結果表現、§5の接続境界、§6の管理API説明の必要箇所を同期する。同じ契約を重複して別表現にしない。
- 「新しいAPIや設定保存契約を導入しない」は、既存 `/api/action` の新actionであることと整合させる。新endpoint・設定保存・ComfyUI URL編集を追加した意味にしない。
- 44×44pxの操作対象、768px未満の折り返し、既存のログ折り畳み・停止/再起動確認を保つ。メモリ解放操作は既存の停止/再起動とは異なる受付操作として説明する。
- frontmatterにREQ-380と設計参照を追加し、最終更新日を実作業日に合わせる。無関係な履歴・仕様は編集しない。

### server_manager_guide.md

- §3.3にComfyUIメモリ解放の操作、状態/非活性理由、受付・失敗・再取得の意味を追加する。
- §1の「socketのみ」等の監視説明をTCP死活確認と時間を制限したHTTP `/queue` 確認へ更新し、現行のメモリ解放状態契約との矛盾を解消する。
- §3.3の後に外部ツール向けネイティブAPI利用の小節を設け、`GET /queue` でrunning/pendingが空であることを確認し、`POST /free` とJSON本文を示す。例は説明用であり、本作業の検証で実機送信しない。
- 外部直接呼出しにはManagerのguardが適用されないこと、停止/未知状態では送信しないこと、応答不明で自動再送しないこと、次回モデル再ロードを明記する。
- 既存のOrigin許可範囲、8000番停止時の8899番復旧経路、通常端末に8188番開放不要というネットワーク境界は保つ。

## Verification Plan

T4はAC-1〜5について記載された契約と参照の一致を検証し、AC-6について外部直接連携の文書内容を担当する。独立したdoc-reviewer/doc-verifyが文書の意味・矛盾・適用範囲・参照を確認する。AC-1〜5の実際のコード/UI動作の受入は、T1/T2/T3と、AC-5 deadline regressionだけを担当する補助Card T5を対象に、独立したtester-reviewer/dev-verifyが判定する。文書PASSはこれらコードACの成立やコード受入の代替を意味せず、coordinatorが文書とコードの判定を別々に統合する。以下はT4のローカル確認と独立文書受入で追跡する。

| ケース | 関連AC | 文書としての判定基準 |
|---|---|---|
| 通常操作 | AC-1 | 両UI→8899 `/api/action`→ComfyUI `/free` の経路、本文、プロセス維持、受付通知が一致する。 |
| 連打/競合 | AC-2 | UI操作中の非活性とManager global lockが説明される。 |
| 生成・待機ジョブ | AC-3 | executingとqueuedをidleとして扱わず、理由付き非活性と送信直前確認を記載する。 |
| 停止・未知状態 | AC-4 | STOPPED/TIMEOUT/queue取得失敗を有効としない。 |
| 受付後・失敗 | AC-5 | 5秒以内の監視同期、取得失敗通知、受付と物理解放の違い、古い/高い観測値の可能性、POST再送禁止とGET監視継続、idle確認までの非活性を説明する。 |
| 外部運用 | AC-6 | 8188番ネイティブAPI例が8000/8899への依存を持たず、呼出し元のidle確認を伴う。 |
| 維持 | 全体 | 既存Origin/ポート境界、復旧入口、停止/再起動・ログ・通常生成の規約を維持する。 |

構造確認は対象2文書の差分、UTF-8/BOM/LF、設計参照の存在を確認する。文書だけを理由としてtypecheck/TDDを追加しない。混合PBI全体の機械的baselineはコード側のテスト計画と `.agents/verification.json` に従う。

## Card and Dependency Rationale

`REQ-380-T4` はdoc-editor/doc-taskが対象2文書だけを所有する。両文書は同一のメモリ解放契約をUI仕様と運用手順に反映するため、1 Cardで整合を確認する。T1（Manager契約）とT2（Settings表示/VRAM同期）の実装戻りを照合してから同期することを実依存とする。T5はユーザー承認済みの追加AC-5 deadline testだけを担う補助カードで、T4の文書所有権・責任範囲を変更しない。

コード・テストと文書の所有ファイルは重複しない。並列化の便益はunknownとし、API名・状態・通知文言の差異が生じた場合は契約を独断で変更せず設計担当へ返す。完全Card本文は300行以内とする。

## Trade-offs and Risks

失敗時に安全側へ倒してunknownを無効とするため、監視障害時は稼働中でもメモリ解放を実行できない。UI確認と送信の間のジョブ開始競合をManagerの直前確認で減らすが、外部プロセスを含む完全な排他までは保証しない。外部ツールの直接API利用では本ツールのguardに依存できない。

成功応答を受付として説明することで、物理VRAM解放量の保証と混同することを避ける。モデル再ロードの待機が発生する取引を明記する。追加設定・別proxyを設けない方針と、既存ポート/Origin境界の維持を両文書で揃える。

## Audit and Handoff

本設計とT4を、統合設計・テスト計画・全コードCardとともに設計BA監査の明示対象とする。監査はcoordinator/コード設計側で統合実行し、固定model key、ctx32768、reasoning none、raw verdictと直後unloadを証拠化する。本書の作成・構造確認は独立受入や監査PASSを意味しない。仕様書の実編集は設計承認後に開始する。
