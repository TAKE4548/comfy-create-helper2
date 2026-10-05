# REQ-317 試験計画

## 自動試験（実装後に実行）

| AC | 試験箇所 | 期待結果 |
|---|---|---|
| 1〜5, 13〜14 | キャッシュ整理utility | 0/29/30/200件、同ID更新、破損値、timestamp欠落の各条件で新規IDを含む最新30件を保持する。 |
| 6, 10〜12 | 生成受付の結合試験 | localStorage書込み前に整理し、無関係キーを維持する。local/serverの失敗を分離し、成功側から記録を参照できる。 |
| 7〜9 | prompt record / preview試験 | cache hitは即時表示、server hitは該当記録を表示、欠落時に別画像や現在入力を表示しない。 |
| 15〜19 | 使用量utility / monitor試験 | 保存領域を分け、UTF-16推定、取得拒否、空領域、他方の継続計測を確認する。 |
| 20〜21 | hook fake timer試験 | 表示中は2500msごと、非表示中は停止、復帰時に即時更新する。 |
| 22〜23 | desktop/mobile component試験 | 説明操作と説明文・各指標のDOM一致を、下記の明示的な判定条件で検証する。 |

### 説明表示・既存指標の判定条件（監査推奨1）

各モニタを個別に描画し、説明の要素が1つ存在すること、`tagName === 'SUMMARY'`、`tabIndex === 0`を確認する。説明操作後の本文は空文字ではなく、次の文字列をすべて含むことを合格条件とする。

- `localStorage`、`sessionStorage`
- `現在のオリジン`、`現在のタブ`
- `キーと値をUTF-16の各2 bytes`

ラベル・値は同じ項目のDOM内で一致させる。local=2048 bytes／session=0 bytesのfixtureでは、それぞれ `localStorage`＋`2.0 KiB`、`sessionStorage`＋`0.0 KiB` が1項目ずつ存在すること。一方の読取拒否fixtureでは、その領域だけが `取得不可` となること。

hardware fixtureはCPU=12%、GPU=34%、RAM=56%（5.6/10GB）、VRAM=78%（7.8/10GB）。各モニタ内でラベルと対応する値が一致し、CPU/GPU使用率が重複表示されないことを確認する。DOM本文の一致と実ブラウザでの開閉・キーボード・タップ操作の合格は分けて記録する。

自動試験コマンド（監査推奨2）:

作業ディレクトリはプロジェクトルートから `frontend`。既存のVitest設定によるjsdom／Testing Library上の試験であり、製品のdevelopment／productionサーバーを起動するコマンドではない。型検査、対象シナリオ、全件試験を順に実行する。各コマンドexit 0、Vitestのfailed 0件を合格条件とする。

```powershell
cd frontend
npm run typecheck
npx vitest run src/utils/__tests__/promptMetadataCache.test.ts src/store/__tests__/slices/jobQueueSlice.test.ts src/utils/__tests__/browserStorageUsage.test.ts src/hooks/__tests__/useBrowserStorageUsage.test.tsx src/components/ResourceGauge/__tests__/ResourceGauge.storage.test.tsx src/utils/__tests__/promptRecord.test.ts src/components/__tests__/HistoryModalPreview.test.tsx src/test/e2e_req317_storage.test.tsx
npx vitest run
```

`frontend/package.json`の `npm test` は `vitest run` の別名だが、本計画では全件試験をフィルターなしの `npx vitest run` に統一する。存在しない `test:unit`／`test:e2e`／`test:ci` scriptは追加しない。`src/test/e2e_req317_storage.test.tsx` もVitest上の結合試験（E2E-like）であり、実ブラウザ検証の代替とはしない。

## 手動ブラウザシナリオ（監査推奨3のユーザー方針）

2026-10-05のユーザー指示により、実ブラウザテストは手動前提とする。Playwright等の自動ブラウザrunnerは導入しない。実行者は日時・ブラウザ・画面幅・入力fixture・期待値・観測値と、可能ならスクリーンショットを記録する。未実施の項目を自動試験の成功でPASSに置き換えない。

1. server記録を有効にして連続生成し、0/30件到達後と200件seedの初回移行後の件数を確認する。cache hitとserver fallbackでprompt/seedを照合する。
2. localStorage保存失敗・server成功、次にserver失敗・local成功を発生させる。生成が継続し、成功側の記録を参照できることを確認する。
3. desktop/mobileでstorage項目を表示する。説明をキーボード・タップで開閉し、上記の説明文を読むことができること。キー＋値のUTF-16コード単位数×2 bytesから算出した期待値と表示値を照合し、追加・更新・削除後、表示中の次の2.5秒更新で反映されることを確認する。非表示中の変更は復帰時に反映されること。
4. 異なるオリジンと同一オリジンの独立した別タブに区別できるfixtureを用意し、localStorageは現在オリジン、sessionStorageは現在タブのデータだけを計測していることを期待値との一致で確認する。画像履歴・設定・保存済みスナップショットの代表データは整理前後で値が一致することを確認する。

## 境界値・異常系

- 破損JSON、timestamp欠落/non-finite、`getItem`/`removeItem`例外を注入する。正常な新しい記録を優先し、部分使用量を正常値として表示しないこと。
- 一方のStorage読取を拒否し、他方は正常計測する。拒否側だけ「取得不可」となる。
- timer tickをまたいでtab visibilityを切替え、unmount/remount後にintervalが重複しないこと。

## 証拠・制約

実装後にコマンド出力とAC証拠を記録する。既存BA監査はINCONCLUSIVE、2026-10-05の追加QA監査は回答取得済み・指摘あり。推奨1・2は本計画に反映し、推奨3はユーザー指定の手動ブラウザテストとして扱う。監査原文は `docs/backlog/ba-audit/REQ-317-qa.md`、実行済み結果と未検証項目は `docs/walkthrough-REQ-317.md` を参照する。監査再実行は今回行っていない。unload結果は監査PASSの証拠ではない。
