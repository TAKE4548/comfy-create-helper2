---
id: REQ-316-T4b
title: 旧情報表示と推測抽出の機械撤去
status: done
depends_on: [REQ-316-T4a]
---
T4の承認済仕様/コンテキストを継承。所有はHistoryModalPreview.tsxのみ。
旧prompt/6項目/LoRA bodyおよび旧find抽出、関連編集state/handlersを撤去（300行以下）。
既存queryの対象解決はT4cで置換。T4a/T4bは同じ撤去作業の逐次範囲で、独立製品機能ではない。
チェック: 撤去対象の検索/行数を確認。T4cでtypecheckと局所testsを行う。
