---
id: REQ-307-test-plan
tags: [generate, queue, error, test]
related_paths: [docs/backlog/pbi/active/REQ-307.md, docs/design/REQ-307.md, docs/design/REQ-141-test-plan.md]
---

# REQ-307 テスト計画

## Gate 1: 型と局所単体テスト

- `cd frontend; npm run typecheck`
- `cd frontend; npx vitest run src/utils/__tests__/queueSubmissionFailure.test.ts src/store/__tests__/slices/jobQueueSlice.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/pages/GeneratePage/hooks/__tests__/useGenerateAction.fault.test.ts src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx src/pages/GeneratePage/components/__tests__/DesktopLayout.tabs.test.tsx src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`
- 理由抽出: ComfyUI `{error:{message,details},node_errors}`、proxy `{detail}`、平文、空文字・空白・状態番号のみ・壊れた JSON・HTML 風の説明、ネットワーク例外、タイムアウトを表で検証。長い説明を切り捨てず、HTML 風の説明はテキストとして表示する。
- ストア: コールバックありは一回だけ理由通知し単独トーストなし、コールバックなしは従来トースト、AbortError は両方なし、`prompt_id` 欠落は理由不明。
- フック: 単一バッチサイズ 1 は番号なし、複数回投入と複数セットは対象・理由の対応、部分成功、全件失敗で理由ごとのエラー通知のみ（成功通知なし）、`queuePrompt` が直接 throw、キャンセル後は通知なし。REQ-141 の failed ステータスと固定長配列を回帰確認。
- 表示: 24行の HTML 風 fixture が加工・HTML解釈されず完全一致で DOM のテキストとして残ること、折返しと最大高/縦スクロールのクラス、閉じるボタンを確認。Desktop/Mobile は通常通知を5秒で消し、`persistent: true` の失敗通知にはタイマーを設定しないことを確認。

## Gate 2: 結合経路

1. ComfyUI が HTTP 400 と汎用 `error.message`、具体的 `error.details` と `node_errors` を返す。proxy → client → store → フックを通して具体的理由を汎用文とともに同じトーストに示す。重複する理由は一つにまとめる。HTTP 2xx で `data.error` が返る形も同じ正規化で確認する。
2. 単一生成の複数回投入で一件だけ失敗する。`i/N` と当該理由を示し、成功件を失敗扱いしない。
3. セット A 1/2 とセット B 2/2 が異なる理由で失敗する。対象/理由を対応づけた2行を一つの通知に示し、対象や理由を混同しない。
4. 全件失敗で各理由を表示し、エラー通知だけを1回出し、成功通知を出さない。REQ-141 のキュー進捗補正を確認する。
5. proxy の 502 detail とネットワークタイムアウトは観測した説明と「投入を確認できない」を表示し、成否を断定しない。

## Gate 3: E2E・Red Team

- `GenerateModalsOverlay` の24行fixtureで改行とHTML風文字列を保ち、`textContent` が入力全文と一致し、HTML要素を生成しないことを確認する。表示に最大高と縦スクロールを設定し、狭い viewport 内に収める。
- Desktop/Mobile の fake timer で通常通知が5秒後に消え、`persistent: true` は5秒後も残り、閉じる操作で消えることを確認する。
- 20件を超える失敗の一括表示は現時点で実画面・E2Eでは検証していない。実装は件数制限なしで行単位に連結し、表示領域を縦スクロール可能にする。手動で確認する際は各対象/番号/理由の全文一致とスクロールを確認する。
- `error.message` が空、`detail` が空白、HTTP 400 のみ、`node_errors` が不規則な構造の場合に理由を捏造しないこと。
- ユーザー中断が通信中・応答直後に入った場合に失敗通知を出さず、既存キャンセル処理を妨げないこと。
- 同じセット名、異なるセット ID、既存 activeBatch あり、バッチ番号境界 1/N・N/N でも対応を取り違えないこと。

## 判定と未確定点

Gate 2 の全 Vitest、Gate 1 の型チェック、AC-1〜5 と REQ-141 の回帰証拠が全て PASS なら自動検証 PASS とする。ブラウザーでの PC/モバイル手動確認と20件超の実画面確認はこの実行では未実施のため、その部分は未検証と報告する。API 応答後の生成実行エラーは対象外。通知が別操作で上書きされた場合の履歴保存は本 PBI の対象外として設計レビューで明示する。

## QA監査所見と文書修正

ローカル QA 監査は exit 0 で、コマンド具体性 6/10、指標の曖昧さ 4/10（long/readable/merge semantics の定義不足）、escape resistance 5/10、総合は machine executability / escape resistance とも conditional PASS と報告した。監査直後に `local_model_adapter.py unload` を exit 0 で実行し、全モデルの解放と VRAM freed の報告を確認した。`nvidia-smi` は環境に存在せず独立確認はできなかった。

この指摘は実装上の受入基準欠陥ではなく、テスト計画の測定語と複数失敗の統合形式の曖昧さとして扱った。本改訂で24行fixture・全文一致、最大高/スクロール、5秒タイマー、一つの通知内に連結した対象ごとの行、20件超の実画面確認は未実施であることを明記した。文書修正後の追加ローカルモデル QA は未実施。
