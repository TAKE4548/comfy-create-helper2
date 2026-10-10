# REQ-333 追加レビュー：取消3操作とサムネ欠損

2026-10-10（Asia/Tokyo）。ユーザーの設計レビュー指摘2点への回答案。現行コードの読取り所見に基づき、実機・コード試験はまだ実施していない。

## Cancellation Compatibility

現物の3操作はJobManagementModal.tsx:21-53/jobQueueSlice.ts:369-521/comfy.py:168-211。表示filterは操作範囲の指定ではない。追加要望AC-36により一括scope選択を追加し、既定「全生成（Studioを含む）」は現行globalのまま保持する。

| 操作 | 全生成（既定all） | 通常生成のみ（normal） |
|---|---|---|
| 単件 | 選択job/prompt IDだけ。scope選択対象外 | 選択scopeに影響されない |
| キューのみ一括取消 | 全BE未投入＋全上流pendingにclear:true、running保持 | 全sessionの識別済みnormal未投入＋正常に対応付いたpending IDのみdelete。Studio/unknown保持 |
| 実行中を含む一括取消 | global clear→global interrupt | 上記normal待機を取消後に再照合。Studio/unknownがrunning/pendingにあればinterruptなし、通常running保持・理由表示。known normalだけならlock下の直前照合後にinterruptを試行可能 |

normalはclient_idや表示残数から推定しない。BE DB job.scope=normalとprompt_idの正の対応を使い、scope不明legacyを削除しない。filter ON/OFFで対象は全session同じ。単件の既存範囲は変更しない。

現行comfy proxyの中断要求はprompt_idを送らない。T6案はcompatibility hintとしてPOST `/interrupt` JSON `{prompt_id}` を送るが、既存handlerは追加keyを無視する可能性がある。ComfyUI全体がtarget IDを拒否するとは主張せず、reported version 0.27.0だけでもtargeted capabilityを証明しない。BE lock/preflightを使い、既知Studio/unknownがrunning又はpendingにあれば送信を常に見送る。hintが無視される場合、known-normal preflight後も外部投入/上流自律切替/遅延到達とのTOCTOUや誤中断を完全防止できない。未確認は自動再送せず、skipped/unconfirmedを全取消完了と表示しない。Studio保護の絶対保証を追加しない。実機のrunning jobを使ったtarget behavior試験はしない。

通常母数は確認済みcancelledだけ減算。Studio取消は成功枚数に算入せず停止終端、running flags解除、Step遷移なし。running履歴cleanupは取消確認後best effort、保存Snapshotは保護する。

## Thumbnail Compatibility

BE `backend/app/routers/comfy.py` には、L1メモリ・L2ディスクのキャッシュミス時にL3の原画 `/view` を取得してWebPを再生成する経路がある。0-byteディスクキャッシュの回復は既存 `backend/tests/test_comfy_proxy.py::test_get_comfy_thumbnail_disk_cache_corrupt_recovery` に試験定義がある。

原画が生きている通常のサムネ欠損は、この既存再生成を維持する。品質・サイズ・形式・保持上限を変更する要件ではない。

一方、FE `frontend/src/pages/GeneratePage/sections/GenerationGallerySection.tsx` の画像 `onError` は、サムネ取得の任意エラーで一覧の画像を即除外する。これを原画の確定404に基づく表示除外へ変更する。サムネ欠損・サムネ再生成失敗・通信失敗を原画欠損と混同しない。原画ありなら履歴を保持し、取得失敗は再試行可能な表示として扱う。保存済みSnapshotは除外しない。

## Verification Requirements

- 単発の待機取消は対象だけを削除し、単発の実行取消は対象照合不一致時にinterruptを送らない。
- キューのみ全取消は他セッション・Studioの待機とBE未投入待機を含み、現在の実行を止めない。
- 実行中を含む全取消はqueue clear→interruptの順序、対象履歴整理、部分失敗通知を確認する。
- フィルタON/OFFによって全体操作の対象を狭めない。確認済み取消の進捗母数反映は1回だけ。
- 原画あり・L1/L2なしで縮小画像を再生成し、0-byteキャッシュの既存回復も維持する。
- サムネ失敗・原画503/timeoutで履歴を消さず、原画の確定404だけを試行表示除外にする。
- 旧履歴など新BEのjob UUIDを持たない画像も、原画の利用状態を確認できる経路を用意する。
- サムネ取得の再試行は無限の自動ループにしない。Snapshotの画像・設定・保存品質を維持する。

詳細な期待値・mock・実端末の確認は更新後の `REQ-333-test-plan.md` と対象Task Cardへ対応付ける。
