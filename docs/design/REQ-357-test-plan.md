---
id: REQ-357-test-plan
title: タグチップ操作復旧の検証計画
status: proposed
tags: [test-plan, frontend, interaction]
related_paths:
  - docs/design/REQ-357.md
  - docs/backlog/task/active/REQ-357-T1.md
  - docs/backlog/task/active/REQ-357-T2.md
  - frontend/src/components/TagChipEditor/TagChip.tsx
  - frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx
---

# REQ-357 Test Plan

## Status and Fixture

設計レビュー前の計画。ここに記す試験は未実施。
AC-1〜5の提案定義はREQ-357設計書が正本。通常/Anima、enabled/disabledの
複数チップ（例 alpha, beta, gamma）、メニュー＋和訳カードを利用する。
実画面はGenerateのチップ編集、Tagsの登録/編集、LoRA編集trigger領域。
書込みAPIを使う保存や生成を行わず、編集途中のUI状態で確認する。
URL/ブラウザversion/viewport/アプリの版と日時を証拠に記録する。

## Gate 1 and Local Unit Verification

cwd: C:/Users/audih/ws/comfy-create-helper2/frontend、追加環境変数不要。

~~~powershell
npm run typecheck
npx vitest run src/components/TagChipEditor/__tests__/TagChip.test.tsx
~~~

各コマンドのexit0を要求。状態を持つfixtureでonEdit後のtextをrerenderし、連続増減の
累積値、onDeleteの対象ID/回数、onToggle、入力Enter/Blur、メニュー内key伝播を確認。
CSS classの更新は構造回帰を確認する補助で、ヒット判定成功の証拠に使わない。
既存REQ-338 testのactive class assertionは閉じた状態/メニュー開状態の契約に合わせる。

## Gate 2

Gate1/対象unit/Full SuiteがPASSしてもAC受入は未成立。
CSSヒット判定の全ACは以下の実ブラウザ観測とGate3の結果を必須とする。

同じfrontend cwdで npm test を既定設定のまま1回実行しexit0。
全件PASS、対象file件数、skip、warningを記録する。無関係suiteの失敗も記録し
対象AC結果と全体Gateを分ける。全体失敗を成功と読み替えない。

## Real Browser Hit Testing

jsdom・DOM要素直接click・locatorのforce-clickのみでACを完了にしない。
実アプリのスタイルが適用されたブラウザに対し座標ベースのmousedown/move/upまたは
touchstart/move/endを用い、実ブラウザの標的を観測する。隔離HTMLだけの成功も最終証拠にしない。
T1の修正前後で同じfixtureとviewportを使用する。

1. 閉じたchipの×/handle/text/hit-slop外縁の中心点で document.elementFromPoint(x,y) を採取。
   SVG path標的なら最も近いbutton/handleまで上がって記録。expected element内の標的を要求。
2. pointerdown/mousedown/touchstart/clickのtarget/composedPathとclient座標を記録。
   ドラッグはactual sensorがMouse/Touchであることに留意し、pointerdownだけを送らない。
3. メニュー開状態で+0.1（Animaは+0.5）を選び、押下前/押下中/離した後にchip/menu/cardの
   getBoundingClientRect()、getComputedStyle(chip).transform、elementFromPointを採取。
   pointerdownとclickの標的が意図したbuttonまたはその子であり、onEditの結果が1回反映されること。
4. 和訳表示あり/なしを比較する。カード境界と強度buttonが重なる場合は位置・標的を保存し、
   transformの問題、カードの覆い、外クリックでの早期unmountを区別する。
5. 修正前の観測が取れなければ「修正前未確認」と明記し、修正後だけで原因確定を宣言しない。

外縁点は未押下chip rectの (left-1, (top+bottom)/2)、
((left+right)/2, top-1) を起点に、computed ::before insetと画面倍率を確認して
拡張内へ置く。既定16px rootではinset-0.5は2px拡張である。
チップ外縁の拡張内は本体メニューへ委譲、×/handle中心は各内側controlへ到達すること。
拡張外かつ隣接chipにも属さない空白点は本体操作を発火しない。
DnDの結果は親onChipsChangeの配列とonChangeの連結文字列の順序で確認する。
実画面でcallbackを直接観測できない場合は生成inputの反映を確認し、
callback呼出し回数の直接検証は未確認として区別する。

## Acceptance Matrix

| Case | 操作 | 期待結果 / AC |
|---|---|---|
| B1 | Generateで先頭handleを8px超移動して最後へdrop | 順序とテキスト出力一致、chip本文保持、メニュー誤起動なし / AC-1 |
| B2 | タッチで同handleを5px超移動してdrop | reorder成立、ページscrollとの競合なし / AC-1 |
| B3 | ×中央を座標click/tap、有効/無効chipで繰返す | 指定chipだけ削除、隣接chip保持、メニュー誤起動なし / AC-2 |
| B4 | 通常mode +0.1を2回、-0.1を2回、1.0へ戻す | 1.2→1.0、括弧表現→通常本文への復帰 / AC-3 |
| B5 | Anima mode +0.5、-0.5、数値1.25→Enter、1.3→Blur | 既存formatの値と末尾句点保持 / AC-3 |
| B6 | 有効/無効toggle、タグ名編集Enter/Blur、翻訳toggle、タグcopy | 親状態と出力一致、内部操作でchip shortcut/閉じる誤起動なし / AC-3 |
| B7 | 本体と外縁2px以内を押す、隣接chipの中点も確認 | 本体押下feedback、領域拡張動作、隣接chip誤選択なし / AC-4 |
| B8 | menuのbutton/入力を押して離す | 親active縮小なし、座標基準変化なし、標的維持 / AC-5 |
| B9 | cardを閉じる/再開/ドラッグ、Escape、外側click | card操作とmenu境界が既存契約どおり応答 / AC-5 |
| B10 | Tags編集/LoRA編集でB1,B3,B4,B6を実施 | 共通Editor利用面で同じ編集結果 / AC-1〜3 |
| B11 | チップ→テキスト→チップ表示を切替 | 本文/順序/重みの編集結果保持。disabled保持は既存仕様に従う |

desktop 1280x800とmobile相当390x844のviewportで操作する。
タッチエミュレーションだけなら「実機未確認」と記し、対応端末の保証範囲を明記する。
実行環境がタッチ操作を提供できない場合、B2はINCONCLUSIVE。

## Gate 3 Red Team

| Case | 境界・異常系 | 期待結果 |
|---|---|---|
| R1 | mouse移動7px以内、touch4px以内 | reorder不発、意図しないmenu/Deleteなし |
| R2 | 密集/折返しchip、viewport端、無効chip、隣接メニュー | 他chipのhit-slopに操作が奪われない。menuの重なりを記録 |
| R3 | 強度へ空/非数値を入力後Blur、下限付近の減算 | 既存入力規則へ復帰または0でclamp、NaN/例外なし |
| R4 | menu inputでDelete/Backspace/Space/Ctrl+D、Escape | 親chip削除/切替/複製が発火せず、Escapeで終了 |
| R5 | 訳のpending/error表示中に強度増減/有効切替 | 翻訳待機が編集操作を遮らない、操作結果は更新 |
| R6 | inline編集・drag中に本体押下、drag後操作 | active縮小/hit-slopが編集・DnDを妨害せず、終了後復旧 |

## Evidence and Verdict

docs/design/REQ-357-walkthrough.md にコマンド/exitcode/件数、ACごとのPASS/FAIL/INCONCLUSIVE、
viewport、event標的、rect/transform前後、画面証拠の参照、未確認事項を保存する。
Gate1/2/3と必須ACの全PASSが完了条件。ブラウザ利用不可・実CSS未適用・未隔離症状は
INCONCLUSIVEとしcoordinatorへ返す。
T2実施後REQ-357設計と本書の実施状態を更新し、従来仕様へ復旧した範囲を明記する。

## QA Audit

T2担当は3-Gate後、既知adapterを使う場合は最初から昇格権限で実行する。
以下はworkspace cwd。context lengthを省略しない。

~~~powershell
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-357-test-plan.md docs/design/REQ-357-walkthrough.md
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload
~~~

localhost 127.0.0.1:1234 / lms が必要。QAのmodel/runtime/設定/対象/原判定/経過時間を記録。
unload exit0はLM Studioモデル未ロードの確認。拒否・失敗はcoordinatorへ報告する。

## T2 Execution Status (2026-10-13 JST)

- Gate 1: `npm run typecheck` exit 0。
- Gate 2 suite: `npm test` exit 0、229 files / 2,081 tests PASS。必須hygiene: `workflow_validator.py test-hygiene REQ-357` exit 1。既存ticket-named test filesのTEST_ACCRETION_VIOLATION等を検出するためGate 2総合FAIL。
- Gate 3: 実アプリのブラウザタブがなく、B1〜B11とR1〜R6の実ブラウザ確認は未実施。AC-1〜5はすべてINCONCLUSIVE。
- QA audit: `qwen/qwen3.5-9b`, context 32768、exit 0だが判定FAIL (Critical Ambiguities Detected)。直後のunloadはexit 0、LM Studioモデル未ロードを確認。
- 総合: INCONCLUSIVE。証拠・ACマトリクスは [REQ-357-walkthrough.md](REQ-357-walkthrough.md)。設計判断を伴う監査指摘はcoordinatorへ返す。PBIをDoneにしない。

