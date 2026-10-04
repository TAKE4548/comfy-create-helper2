---
id: REQ-316-T4c
title: 新パネル接続とプレビュー統合検証
status: done
depends_on: [REQ-316-T4b]
---
T4の承認済仕様/コンテキストを継承。所有はHistoryModalPreview.tsxおよび同局所testのみ。
解決utility/T14/T13へ接続、saved paramsの空辞書を正本として保持、画像と情報のresponsive配置、現在アルバム、編集/保存中の操作抑制を実装。
変更300行以下。T4元受入基準すべてを満たし、T4a/T4bを含めnpm run typecheckおよびHistoryModalPreview.test.tsxで検証。
後続T8は集約T4完了に依存し、外部DAGは変わらない。
