# インシデントレポート: ワークフローのコピー時にバイパス設定がコピーされない

> 更新日: 2026-08-01

---

## 1. 概要

既存のワークフローをコピー（複製）した際に、元のワークフローに紐づいていたバイパス設定（プロファイル: `BypassProfile`）がコピー後の新しいワークフローに複製されず、消失（空の状態に）してしまう不具合。

---

## 2. 現象（症状）

| # | 現象 | 再現頻度 |
|---|------|---------|
| A | バイパスプロファイルが設定されたワークフローをコピー作成すると、作成された新ワークフローのバイパス設定が引き継がれず空になる | 100% |

**再現手順:**
1. バイパスプロファイル（Bypass Profile）が1つ以上登録されているワークフロー（`Workflow`）を用意する。
2. ワークフローのコピー機能（`POST /api/workflows/{workflow_id}/copy`）を実行し、複製されたワークフローを作成する。
3. 複製された新しいワークフローのバイパスプロファイル一覧（`GET /api/workflows/{new_workflow_id}/bypass-profiles`）を取得する。
4. **結果**: 元のワークフローに存在したバイパスプロファイルがコピー後のワークフローに一切存在しない。

---

## 3. 根本原因の特定

### 根本原因: `copy_workflow` エンドポイントでの `bypass_profiles` 複製処理の欠落

**対象ファイル・行**: [`backend/app/routers/workflows.py`](backend/app/routers/workflows.py#L35-L43) (`copy_workflow` 関数)

**詳細**:
`copy_workflow` 関数において、ソースワークフロー（`src`）から新ワークフロー（`new_wf`）へ関連データをコピーする際、`src.mappings`（ノードマッピング）および `src.presets`（プリセット）の複製処理は記述されているが、`src.bypass_profiles` の複製処理が完全に欠落している。

```python
# backend/app/routers/workflows.py L35-L43
for m in src.mappings:
    db.add(models.WorkflowMapping(workflow_id=new_wf.id, master_id=m.master_id, node_id=m.node_id))
for p in src.presets:
    db.add(models.WorkflowPreset(
        workflow_id=new_wf.id, name=p.name,
        param_values=p.param_values, applied_assets=p.applied_assets,
        batch_size=p.batch_size, seed_mode=p.seed_mode, seed=p.seed,
        sort_order=p.sort_order,
    ))
# ※ src.bypass_profiles の複製ループが存在しない
```

---

## 4. 不具合の分類

| 項目 | 内容 |
|------|------|
| **分类 / 分類** | **Type A (Implementation Bug)** / 実装不具合 |
| **理由** | ワークフロー複製の仕様として、マッピングやプリセット同様にバイパスプロファイルも引き継がれるべきであるが、バックエンドのコピーエンドポイントにおいて `bypass_profiles` の複製ループの実装漏れが発生しているため。 |
| **影響範囲** | バックエンド: `backend/app/routers/workflows.py` (`copy_workflow`) |
| **深刻度** | 中（ユーザーが設定したバイパスプロファイルが複製時に引き継がれない） |

---

## 5. 障害箇所サマリー

```
[backend/app/routers/workflows.py]
  L35-L43  copy_workflow 関数
    └─ 問題: src.bypass_profiles の複製ロジックが欠落している
```

---

## 6. 推奨する次のステップ

- **分類**: Type A → `/dev-design` へ移行して設計・修正作業を実施
