# Prompt Surgeon — Settings ページ仕様書 (SPEC_SETTINGS)

**バージョン**: 1.0  
**最終更新**: 2026-06-13  
**実装ファイル**: `frontend/src/pages/SettingsPage.tsx`（現行 559行 ← 🟡 リファクタリング対象）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md)

---

## 1. 概要

アプリケーション全体の基本設定を管理するページ。  
ノードマッピングマスタの編集・ワークフローの削除を主要機能とする。

---

## 2. 機能一覧

| 機能 | 説明 |
|---|---|
| マッピングマスタ一覧 | 登録済みの MappingMaster を一覧表示 |
| マッピングマスタ編集 | role / expected_class_types / param_name / input_type / display_name / title_patterns を編集 |
| マッピングマスタ登録 | 新規 MappingMaster の追加 |
| マッピングマスタ削除 | 既存 MappingMaster の削除 |
| ワークフロー一覧 | 登録済みワークフローを一覧表示 |
| ワークフロー削除 | 登録済みワークフローの削除 |
| LLM プロンプト編集 | LLM 監査用システムプロンプト（`llm_prompts` テーブル）の確認・更新 |
| 接続ステータス確認 (Connections) | FastAPI Backend および ComfyUI への接続状態をリアルタイムで確認 |

---

## 3. レイアウト

セクション別タブまたはアコーディオン構成。

```
┌─────────────────────────────────────────────────────────┐
│ Settings                                                │
├─────────────────────────────────────────────────────────┤
│  [ノードマッピングマスタ] タブ                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │ role            │ input_type │ display_name │ ✏ │   │
│  │ Main_Positive.. │ textarea   │ Main prompt  │ 🗑 │   │
│  └─────────────────────────────────────────────────┘    │
│  [+ 新規マスタ追加]                                      │
├─────────────────────────────────────────────────────────┤
│  [ワークフロー管理] タブ                                  │
│  ┌─────────────────────────────────┐                    │
│  │ portrait_v3        2026-06-01  🗑│                    │
│  └─────────────────────────────────┘                    │
├─────────────────────────────────────────────────────────┤
│  [LLM プロンプト] タブ                                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ key: audit_interference                         │    │
│  │ description: 干渉タグ診断用（SDXL/汎用）          │    │
│  │ [content textarea]                              │    │
│  │ [Save]                                          │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

---

## 4. MappingMaster データモデル

```typescript
interface MappingMaster {
  id: number;
  role: string;                        // 役割識別子（例: "Main_Positive_Prompt"）
  expected_class_types: string[];      // 対応する ComfyUI ノードクラス
  param_name: string;                  // ノードの入力パラメータ名
  input_type: 'textarea' | 'int' | 'float' | 'select' | 'lora_stack' | 'select_sampler' | 'select_scheduler';
  display_name: string;                // フロントエンド表示名
  title_patterns: string[];            // 自動マッピング時のノードタイトルマッチパターン
}
```

プリセット一覧は [SPEC_SUMMARY.md §6](./SPEC_SUMMARY.md#6-db-設計sqlite) を参照。

---

## 5. 接続ステータス (Connections)

アプリケーションが依存する外部サービスの稼働状況を表示する。

- **FastAPI Backend**: フロントエンドが稼働しているオリジンの `/health` エンドポイントへリクエストを送信し、疎通を確認する。
- **ComfyUI**: 設定されている ComfyUI URL（WebSocket接続用URL）のヘルティネスを確認する。

---

## 6. API 呼び出し

| 操作 | エンドポイント |
|---|---|
| マッピングマスタ一覧 | `GET /api/mapping-masters` |
| マッピングマスタ登録 | `POST /api/mapping-masters` |
| マッピングマスタ更新 | `PUT /api/mapping-masters/{id}` |
| マッピングマスタ削除 | `DELETE /api/mapping-masters/{id}` |
| ワークフロー一覧 | `GET /api/workflows` |
| ワークフロー削除 | `DELETE /api/workflows/{id}` |
| LLM プロンプト一覧 | `GET /api/llm-prompts` |
| LLM プロンプト更新 | `PATCH /api/llm-prompts/{key}` |

---

## 7. リファクタリング計画

現行 559行。セクション単位で sub-components に分割して各ファイル ~200行以内に収める。

```
pages/SettingsPage/（分割後）
  index.tsx                       ← タブ/セクション切り替えのみ（~80行）
  components/
    MappingMasterSection.tsx      ← マッピングマスタ一覧・編集UI（~150行）
    MappingMasterFormModal.tsx    ← 登録・編集フォームモーダル（~150行）
    WorkflowSection.tsx           ← ワークフロー一覧・削除UI（~80行）
    LlmPromptSection.tsx          ← LLM プロンプト編集UI（~100行）
```
