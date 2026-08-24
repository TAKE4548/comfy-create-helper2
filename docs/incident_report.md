# インシデントレポート: プロンプト翻訳機能の不発（TypeError発生）およびGoogle無料翻訳エンドポイントの利用規約・仕様に関する調査報告書

## 1. 障害概要 (Overview)

プロンプト翻訳機能において、モーダル上の「翻訳する」ボタンをクリックしても翻訳処理が実行されず、画面上で何も起きない現象が報告された。
また、合わせて「無料のGoogle翻訳エンドポイント（`translate_google_free`）の利用がスクレイピングや利用規約違反に該当するのではないか」という懸念事項についての調査を行った。

### 観測されている事象:
1. **「翻訳する」ボタン押下時の無反応**: モーダルを開いて「翻訳する」ボタンをクリックしても、ローディング状態にならず、APIリクエストも送信されず、エラー表示も出ない。
2. **無料Google翻訳の仕様・規約上のリスク**: 非公式の `translate_a/single?client=gtx` エンドポイントへの依存、およびバックエンドにおけるエラー握りつぶし。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

- **再現手順**:
  1. Generate画面を開く。
  2. プロンプト入力欄（Positive Prompt等）の翻訳アイコンをクリックして `PromptTranslationModal` を開く。
  3. テキストを入力、または既存のプロンプトがセットされた状態で「翻訳する」ボタンをクリックする。
- **観測結果**:
  1. ボタンをクリックしてもローディング表示（スピナー）にならず、ネットワーク通信も発生せず、画面に何の変化も起きない。
  2. ブラウザのコンソールログを確認すると `TypeError: textToTranslate.trim is not a function` が発生している。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/pages/GeneratePage/hooks/usePromptTranslation.ts` | L41-48 (`executeTranslate`) | `customText !== undefined` による判定を行っているため、Reactのクリックイベント（`MouseEvent` オブジェクト）が `customText` に渡され、`textToTranslate.trim()` で `TypeError` がスローされて処理が中断する。 |
| 2 | `frontend/src/pages/GeneratePage/components/PromptTranslationModal.tsx` | L114 (`onClick={onTranslate}`) | `onClick` ハンドラに直接 `onTranslate` を渡しているため、イベントオブジェクトが引数として渡される。 |
| 3 | `backend/app/services/translation_service.py` | L82-108 (`translate_google_free`), L278-285 (`translate_prompt`) | 非公式Webエンドポイント（`translate.googleapis.com/translate_a/single?client=gtx`）を使用しており、エラー発生時に例外をキャッチして未翻訳テキストをそのまま返す（サイレントフォールバック）。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 根本原因 1: フロントエンドにおけるイベントオブジェクト（`MouseEvent`）の不正代入と例外中断（主原因）
- `usePromptTranslation.ts` の `executeTranslate` は以下のシグネチャとなっている：
  ```typescript
  const executeTranslate = useCallback(
    async (customText?: string) => {
      const textToTranslate = customText !== undefined ? customText : sourceText
      if (!textToTranslate.trim()) { ... }
  ```
- `PromptTranslationModal.tsx` ではボタンの `onClick={onTranslate}` としてバインドされている。
- Reactの `onClick` コールバックは第1引数に `SyntheticBaseEvent`（`MouseEvent` オブジェクト）を渡すため、`customText` にオブジェクトが代入され、`customText !== undefined` が `true` と評価される。
- 結果として `textToTranslate` に `MouseEvent` が格納され、`try` ブロックの手前で `textToTranslate.trim()` が実行されることで **`TypeError: textToTranslate.trim is not a function`** が発生し、処理が即時中断（API呼び出しやローディング設定に到達しない）する。

### 根本原因 2: Google無料翻訳のスクレイピング該当性・利用規約上の位置づけ
ユーザーから指摘のあった「無料Google翻訳がスクレイピングに当たるか」についての調査結果：
1. **非公式エンドポイントの利用（スクレイピング・不正アクセス該当性）**:
   - 現在実装されている `https://translate.googleapis.com/translate_a/single?client=gtx` は、Googleが外部公開している公式APIではなく、ブラウザ拡張等向けに内部利用されている非公式エンドポイントである。
   - Googleの利用規約（ToS）では、公式に提供されていないWebエンドポイントへの自動化ツールによるアクセスやリバースエンジニアリングは禁止（いわゆる非公式スクレイピング／規約外利用）に該当する。
   - IP制限、CAPTCHA要求、HTTP 429/403による急な遮断リスクが極めて高い。
2. **公式な推奨代替手段**:
   - Google翻訳を利用する場合の公式手段は **Google Cloud Translation API**（APIキー指定）である（本システムには既に `google_cloud` プロバイダが実装済み）。
   - 無料/ローカルで利用する場合は **ローカルLLM（Ollama/LM Studio）による翻訳プロバイダ（`llm`）** や、無料枠のある **DeepL API Free**（`deepl`）が正規かつ安全な選択肢となる。
3. **バックエンドのサイレント失敗**:
   - 万が一Google無料エンドポイント側で429/403遮断が発生した場合でも、バックエンド（`translation_service.py` L284）がエラーを握りつぶして原文をそのまま返すため、ユーザーには「翻訳されずにスルーされた」ように見える構造になっている。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug / 実装不具合)**
  * フロントエンドの引数処理（イベントオブジェクトの型判定不備）による `TypeError` 実装不具合。
  * （付帯事項）非公式Googleエンドポイントの規約リスクについては、設定画面での注意喚起や公式プロバイダ（DeepL Free / Google Cloud / Local LLM）の推奨、エラー伝搬の改善等の対応が推奨される。

---

## 6. 次のステップ提案 (Next Action)

不具合の原因特定（フロントエンドのイベント引数処理の不備）およびGoogle無料翻訳の規約リスク調査が完了しました。

バックログへの PBI 登録と修正設計（`executeTranslate` の引数保護、および翻訳プロバイダの取り扱い方針整理）を行うため、**`/dev-design` ワークフロー** への移行を提案します。

