# REQ-344 原因分析

分析日: 2026-10-13

## 結論

元の `GeneratePage.test.tsx` の5000ms timeoutの直接原因は、REQ-161 テストで
deferred promiseのresolve/rejectとpromise待機を同じ `async act` に入れていたことである。
mount 時 API mock の不足は警告と非同期更新を増やす別のテストハーネス欠陥だったが、
今回の比較実験ではtimeoutの直接原因ではなかった。

原因候補は次のように分ける。

1. **確定: REQ-161 テストの `async act` が収束しない**
   - `workflowsApi.get` が呼ばれたことを確認せず deferred promise を resolve している。
   - resolve と React の後続更新を広い `async act` でまとめて待っている。
   - 5000ms の test timeout は、通常約1000msの `waitFor` timeout より、
     `async act` が収束しなかった挙動と整合する。
2. **確定した別欠陥: mount 時 API mock の不足**
   - `lorasApi.getComfyModels` 不在は `No queryFn` 警告の確定原因である。
   - `baseModelsApi.list`、`paramTypeMastersApi.list`、`comfyApi.getObjectInfo` も
     baseline mock にない。
   - `comfy-object-info` query は明示的な `retry: 3` を持ち、
     test QueryClient の `retry: false` を上書きする。
3. **予防修正: cleanup、query cancel/clear の不足**
   - 未完了 observer/query が `act` の収束と次ケースへ影響する余地がある。

`getComfyModels` の不足は警告原因として確定しているが、これ単独を元の
5000ms timeout の根因とは断定しない。警告と更新量を増やす要因として扱う。

## 2026-10-13 比較実験

API mock補完、`workflowsApi.get`の開始待ち、cleanup/query clearを入れた状態でも、
resolve側2ケースは次のように失敗した。

- Desktop: 5012msでtest timeout
- Mobile: 1076msでbuttonがdisabledのまま

次に、他の条件を保持したまま、resolveと`await workflow.promise`を囲む
`await act(async () => ...)`だけを外した。QueryClientの
`['workflow', 1]`が`success`になることを待ってからDOMを確認した結果、
Desktop 445ms、Mobile 357msで2/2 PASSした。

対象ファイル全体では、reject側Desktopも同じ `async act` 内で5006ms timeoutした。
reject側も同じ方法でQueryClientの`error`を待つ形へ変更すると、REQ-161の
resolve/unresolved/reject × Desktop/Mobile 全6件がPASSした。

その後、REQ-161全6件を独立processで5回連続実行し、全5回exit 0、合計30/30 PASS。
各runのtest部分は約1.0-1.1秒で、5000ms timeoutは再発しなかった。

対象ファイル全体の再実行でもREQ-161は6/6 PASSし、timeoutはなかった。
ファイル全体はREQ-186の既存fixture回帰3件により15/18 PASS、exit 1であり、
REQ-344のAC-1とファイル全体PASSはまだ達成していない。

このA/B比較ではmockとcleanup条件を固定し、`async act`境界だけを変更して
失敗から安定PASSへ変化したため、元timeoutの直接原因を `async act` の誤用と判定する。

## 一次証拠

過去に保存された JSON report と log から、同じ2ケースが異なる形で失敗している。

| 証拠 | Desktop | Mobile | 読み取れること |
|---|---:|---:|---|
| `REQ-347-r14-full-vitest-elevated.json` | 5010ms timeout | 1163ms assertion failure | timeout と DOM 未更新が同一runで発生 |
| `REQ-347-r14-full-vitest-rerun.json` | 5007ms timeout | 151ms PASS | layout 固有の再現ではない |
| `REQ-347-r14-full-vitest-final.json` | 159ms PASS | 176ms PASS | 同じテストが正常時は短時間で完了 |
| `REQ-347-r14-GeneratePage-file-elevated.json` | PASS | 5005ms timeout | 単体ファイルでも再現 |

単体ファイルで再現しているため、full suite の並列負荷は必要条件ではない。
負荷が発生確率を上げる可能性は残るが、根因としては扱わない。

成功した `REQ-347-GeneratePage-file.log` にも、13/13 PASS と同時に次のノイズがある。

- `comfy-lora-models No queryFn`: 96件
- `not wrapped in act`: 21件

警告の存在だけでは失敗を決定しない一方、未管理の非同期更新が成功runにも残ることを示す。

## Baseline テストの同期上の問題

REQ-161 ケースは deferred な `workflowsApi.get` を用意して render した後、
query の開始を確認せず、直ちに resolver を `await act(async () => ...)` 内で呼ぶ。

TanStack Query v5 の fetch 開始は QueryObserver の subscribe 後である。
したがって、render 後に resolver を呼べることと、対象queryが開始済みであることは同義ではない。
React scheduler の進み方によって、`act` が query、retry、派生更新まで抱える範囲が変わる。

また、Mobile の 1163ms assertion failure は通常の `waitFor` timeout と整合するが、
5000ms timeout は test 全体の上限に達している。二つを同じ「ボタンが遅い」現象として
扱うより、前者を DOM 更新の未観測、後者を `act` の未収束として分ける方が証拠に合う。

## 候補の評価

| 候補 | 評価 | 根拠 |
|---|---|---|
| deferred promiseを待つ広い `async act` | 確定 | 同一条件のA/B比較と30/30 PASS |
| mount 時 API mock 不足 | 確定した別欠陥 | 警告を実測、明示retry queryあり |
| cleanup/query clear 不足 | 予防修正 | observer と未完了更新をケース境界で破棄 |
| store/mock state leakage | 中低 | 一般的なリスクだが REQ-161 の直接証拠は弱い |
| autosave の1200ms待機 | 低 | 別ケースであり REQ-161 timeout の位置と合わない |
| full suite 並列負荷 | 増幅要因のみ | 単体ファイルでも再現したため必要条件ではない |
| Desktop/Mobile 製品ロジックの欠陥 | 低 | 失敗側がrunごとに入れ替わり、正常時は約150ms |
| 現在の Node `realpathSync.native` EPERM | 別問題 | collection前の環境障害で、過去の収集済みtimeoutを説明しない |

## 最小の検証順序

原因帰属を崩さないため、既存の広範な fixture 書換えや autosave 改修とは分離する。

1. REQ-161 の2ケースだけで `workflowsApi.get` の呼出しを先に待つ。
2. resolverを `async act` 外で呼び、QueryClientの `success` を待つ。
3. assertion 時に対象DOMを再取得してenabledを待つ。
4. 元の13ケース、全体suite連続5回の順に検証する。

mount時API mock補完、Zustand fixture書換え、追加ケース、cleanup/query clear、診断コード、
autosave/fake timer変更は最終修正へ含めず、対象testをHEADの13ケースへ局所復元する。
これらは原因確認に使った実験条件または別欠陥であり、REQ-344の直接修正ではない。
どの変更で timeout が消えたかは比較実験の証拠として残す。
失敗した場合は、query呼出し前、promise完了待ち、`act`、`waitFor` のどこで停止したかを記録する。

## 判定

元timeoutの確定原因は **deferred promiseの完了を広い `async act` 内で待つ同期の誤り**。
不完全な API mock は同じファイルに存在した別欠陥だが、REQ-344の最終修正には含めない。
EPERM の追加調査を先に行っても、元の flaky の原因帰属は改善しない。
旧T1-T9をsuperseded履歴として保持し、T10-T12の最小差分計画をレビューする。
