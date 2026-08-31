# REQ-216: モバイルモードにおけるセリフ一括変換モーダル下部被り解消および履歴ヘッダーレスポンシブレイアウト修正 テスト計画書

## 1. テスト概要
本テスト計画は、REQ-216における共通コンポーネント（`<Modal>`, `<PageHeader>`）の導入、セリフ一括変換モーダルのモバイル下部メニュー被り解消、および履歴ヘッダーのレスポンシブレイアウト修正の受入基準（AC-1 〜 AC-5）を検証する。

---

## 2. 受入基準 (AC) トレーサビリティ

| AC番号 | 内容 | 検証方法 | 検証ファイル/コマンド |
|---|---|---|---|
| **AC-1** | 共通 `<Modal>` コンポーネントが `.modal-backdrop`（`z-index: var(--z-modal)` [100]、モバイル下部ナビパディング）を適用し、Esc/背景クリック/イベント伝播防止を担保すること | 単体テスト | `Modal.test.tsx` |
| **AC-2** | 共通 `<PageHeader>` コンポーネントが `flex-wrap` とレスポンシブ余白を提供し、要素のはみ出しを防止すること | 単体テスト | `PageHeader.test.tsx` |
| **AC-3** | モバイル画面幅（< 1024px）において、「セリフ一括変換」モーダルがボトムナビの前面に表示され、下部アクションボタンが完全に操作可能であること | 単体テスト / 手動確認 | `BatchSpeechTransformModal.test.tsx` |
| **AC-4** | モバイル画面幅（375px〜414px）において、履歴ページのヘッダー要素（Albums タブ含む）が画面外にはみ出さず正常にタップ・遷移できること | 単体テスト / 手動確認 | `HistoryPage.test.tsx` |
| **AC-5** | デスクトップ表示（>= 1024px）において、既存のレイアウトやモーダル表示に崩れ・デグレが発生しないこと | 単体テスト | `npm test` |

---

## 3. テスト実行コマンド (CLI)

```bash
cd frontend
npm test -- src/components/common/__tests__/Modal.test.tsx src/components/common/__tests__/PageHeader.test.tsx src/components/__tests__/BatchSpeechTransformModal.test.tsx src/pages/__tests__/HistoryPage.test.tsx
```
