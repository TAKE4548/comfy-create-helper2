---
id: REQ-316-T4a
title: 旧関連編集UIの機械撤去
status: done
depends_on: [REQ-316-T1, REQ-316-T13, REQ-316-T14]
---
T4の承認済仕様/コンテキストを継承。所有はHistoryModalPreview.tsxのみ。
旧Applied Assets JSXブロックだけを撤去（300行以下）。外部の仕様/依存は変更しない。
同じ担当がT4b→T4cへ続ける。途中の未使用変数は次段階で撤去するため、完了検証はT4cと一緒に実施。
チェック: JSX削除範囲と変更行数を確認し、他の画像操作を維持。
