# インシデントレポート: モバイル環境でreq126のパラメータ同期設定用モーダルが開かない

> 更新日: 2026-08-03

---

## 1. 概要

モバイル表示時（`MobileLayout`コンポーネント使用時）において、REQ-126で追加された「パラメータ同期設定モーダル（`ParamSyncModal`）」を開くボタンを押してもモーダルが一切開かない不具合。

---

## 2. 現象（症状）

| # | 現象 | 再現頻度 |
|---|------|---------|
| A | モバイル画面サイズ（`MobileLayout`）でパラメータ同期設定ボタンをクリックしてもモーダルが表示されない | 100% |

**再現手順:**
1. モバイル端末またはブラウザのレスポンシブモード（画面幅1024px未満）で生成ページ（`GeneratePage`）を開く。
2. 画面下部のパラメータパネル（`ParamPanel`）内のパラメータ同期設定管理ボタン（`onOpenParamSyncSettings`）を押下する。
3. **結果**: モーダルが表示されず、何も反応がない（または管理ボタン自体が表示・動作しない）。

---

## 3. 根本原因の特定

### 根本原因: `MobileLayout.tsx` における `ParamSyncModal` および各種プロパティ・状態の連携漏れ

**対象ファイル・行**: [`frontend/src/pages/GeneratePage/components/MobileLayout.tsx`](frontend/src/pages/GeneratePage/components/MobileLayout.tsx)

**詳細**:
REQ-126（TASK-REQ-126-T2）実装時に `DesktopLayout.tsx` には `ParamSyncModal` のインポート・状態管理・`ParamPanel` へのプロパティ伝達・モーダル描画が組み込まれましたが、`MobileLayout.tsx` ではこれらが完全に欠落していました。

1. **インポート・モーダル描画の欠落**:
   `MobileLayout.tsx` に `ParamSyncModal` のインポートおよび `{isParamSyncSettingsOpen && <ParamSyncModal ... />}` のJSX描画が存在しない。
2. **状態管理の欠落**:
   `isParamSyncSettingsOpen` のローカル `useState` および `useGenerationStore` からの `paramSyncGroups`, `toggleParamSyncGroup` の呼び出しが存在しない。
3. **ParamPanel への Prop 伝達の欠落**:
   `MobileLayout.tsx` 内で `<ParamPanel />` に `paramSyncGroups`, `onToggleParamSync`, `onOpenParamSyncSettings` が渡されていないため、`ParamPanel` 側でモーダルを開くコールバックが発火しない。

---

## 4. 不具合の分類

| 項目 | 内容 |
|------|------|
| **分類 / Classification** | **Type A (Implementation Bug)** / 実装不具合 |
| **理由** | デスクトップ環境とモバイル環境のコンポーネント分離（`DesktopLayout` / `MobileLayout`）において、REQ-126の新機能追加時に `MobileLayout` への組み込みが漏れてしまった実装不備であるため。 |
| **影響範囲** | フロントエンド: `frontend/src/pages/GeneratePage/components/MobileLayout.tsx` |
| **深刻度** | 中（モバイル端末からパラメータ同期グループの追加・編集・削除が行えない） |

---

## 5. 障害箇所サマリー

```
[frontend/src/pages/GeneratePage/components/MobileLayout.tsx]
  - ParamSyncModal の import 漏れ
  - const [isParamSyncSettingsOpen, setIsParamSyncSettingsOpen] = useState(false) の定義漏れ
  - paramSyncGroups, toggleParamSyncGroup の store からの取得漏れ
  - ParamPanel への paramSyncGroups, onToggleParamSync, onOpenParamSyncSettings の渡下漏れ
  - JSX内での <ParamSyncModal /> 描画漏れ
```

---

## 6. 推奨する次のステップ

- **分類**: Type A → `/dev-design` へ移行して `MobileLayout.tsx` への `ParamSyncModal` 組み込み設計・修正作業を実施
