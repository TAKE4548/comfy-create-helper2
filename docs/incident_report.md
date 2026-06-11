# インシデントレポート: キャラクターLoRA系のプロンプト入力欄がない

## 現象 (Symptoms)
- 読み込んだワークフロー（例: `BunnyGarden_temari`）において、キャラクターLoRA用のプロンプト（顔やその他部位などのプロンプト指定タグ）を入力するためのテキストエリア（入力欄）が画面に表示されない。
- ワークフロー `ume_` では、キャラクターLoRA用のプロンプトノード（`Prompt_Char_Lora_Face`、`Prompt_Char_Lora_Other`）が、それぞれ「Composition（構図）」や「Background & Environment（背景・環境）」などの関係のない役割（Role）に誤ってマッピングされており、入力したデータが意図しないノードに送信されている。

## 再現手順 (Reproduction Steps)
1. Generate画面でワークフロー `BunnyGarden_temari` を選択してロードする。
2. 左カラムのプロンプト入力エリアを確認すると、「Character / Series」や「Body & Outfit」などの欄はあるが、キャラクターLoRA（Face / Other）用のプロンプトを入力するための専用欄が存在しない。
3. マッピングの再スキャン・修正ボタン（スキャンアイコン）をクリックしてマッピング編集画面（RescanModal）を開くと、ワークフロー内の `366:344`（`Prompt_Char_Lora_Face`）および `366:345`（`Prompt_Char_Lora_Other`）に対応する役割が存在せず、マッピングできない。

## 根本原因分析 (Root Cause Analysis)
1. ワークフロー内には、キャラクターLoRA用の詳細プロンプトを制御するための以下のノードが存在する：
   - ノード `366:344`（タイトル: `Prompt_Char_Lora_Face`、クラス: `PrimitiveStringMultiline`）
   - ノード `366:345`（タイトル: `Prompt_Char_Lora_Other`、クラス: `PrimitiveStringMultiline`）
2. しかし、システムが提供するマッピングマスタ（`backend/app/main.py:41-49` で初期値シード）には、これら2つのノードに対応する役割（`Prompt_Char_Lora_Face` および `Prompt_Char_Lora_Other`）が定義されていない。
3. このため、自動スキャン時にこれらのノードが検出されず、また手動マッピング設定でも選択肢に表示されないため、画面上に入力欄を表示させることができない状態となっている。

## 分類 (Classification)
- **Type B (仕様不備 / Specification Flaw)**
  - ワークフロー設計に対して、マッピングマスタ（`mapping_master`）に必要な役割定義（仕様）が不足しているため。

## 推奨される次ステップ
- バックエンドのシードデータ定義（`backend/app/main.py`）に `Prompt_Char_Lora_Face` および `Prompt_Char_Lora_Other` のマスタ定義を追加し、既存のデータベースに対してもマイグレーションまたはデータ追加を実行する。
- ワークフローのマッピング定義を修正し、対応するノードを正しい役割に紐付け直す。
