# Incident Triage Report: FuguMT翻訳実行時のsentencepiece依存欠落によるエンジン初期化失敗

<incident_metadata>
- Created_At: 2026-10-03 13:29:18
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 翻訳実行時（POST /api/translate/prompt 等）に HTTP 500 エラーが発生し、'Translation failed: FuguMT engine is not available' が返却される。モデルファイル自体は配置されているにもかかわらず、エンジンが利用不可と判定される。
- Reproducibility: 100%再現可能。backend/.venv 環境下で FuguMTService.initialize() を実行すると、AutoTokenizer.from_pretrained 呼び出し時に sentencepiece 未インストール起因のエラーが発生し False が返却される。
- Impact_Scope: FuguMT を翻訳プロバイダーに設定している環境において、和訳機能（タグチップ翻訳プレビュー、Generate画面でのプロンプト和訳、設定画面での疎通テスト等）が HTTP 500 で全停止する。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: FuguMTService.initialize() 内で MarianMT ベースのトークナイザーをロードする際、transformers.AutoTokenizer.from_pretrained は sentencepiece を必須とするが、backend/requirements.txt に定義されておらず仮想環境に未導入だったため例外が発生し、initialize() が False を返却。translate_batch() で RuntimeError('FuguMT engine is not available') が送出されていた。テストで AutoTokenizer がモックされていたためCI等で検知されなかった。
- Failure_Location: `backend/requirements.txt:23, backend/app/services/fugumt_service.py:78`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. backend/requirements.txt に sentencepiece>=0.2.0 を追加し環境へインストールする。2. fugumt_service.py の initialize() で初期化失敗時の詳細原因メッセージを保持・伝播する。3. 依存ライブラリのインポート・ロードを検証するテストを追加する。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-311
</linked_artifacts>
