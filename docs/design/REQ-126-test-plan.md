# REQ-126 テスト計画書 (Test Plan)

## 1. 自動テスト (Automated Tests)

### バックエンド API テスト (`backend/tests/test_param_sync_groups.py`)
- `test_create_param_sync_group`: ワークフローにパラメータ同期グループが正常に作成できること。
- `test_list_param_sync_groups`: ワークフローIDに基づく同期グループ一覧取得ができること。
- `test_update_param_sync_group`: 主項目・従項目・Active状態（is_enabled）の更新が反映されること。
- `test_delete_param_sync_group`: 同期グループが正常に削除されること。

実行コマンド:
```bash
pytest backend/tests/test_param_sync_groups.py
```

### フロントエンド Unit / Component テスト (`frontend/src/components/__tests__/ParamSyncModal.test.tsx`)
- `ParamSyncModal` で主項目および従項目群を正しく選択して同期グループを作成できること。
- トグルスイッチ操作により Store の Active/Deactive 状態が更新されること。

実行コマンド:
```bash
cd frontend && npm test -- ParamSyncModal
```

## 2. 手動検証 (Manual Verification Plan)

1. **同期グループ作成・編集**
   - パラメータパネルの「Param Sync」設定ボタンからモーダルを起動し、主項目（例: CFG）と従項目群（例: CFG_Sub1, CFG_Sub2）を選択して同期グループを作成する。
2. **Active トグル動作と UIグレーアウト**
   - 作成した同期グループのトグルを ON (Active) にする。
   - パラメータパネル上で従項目群（CFG_Sub1, CFG_Sub2）の入力欄がグレーアウトされ手動変更不可になることを確認する。
3. **主従連動値での生成実行**
   - 主項目（CFG）に `8.5` を入力し「Generate」を実行。
   - 生成リクエスト送信ペイロードにて、従項目の値が `8.5` に動的に置き換わって送信されていることを確認する。
4. **Deactive トグル動作と個別設定復帰**
   - 同期グループのトグルを OFF (Deactive) に切り替える。
   - 従項目群のグレーアウトが解除され、個別に値を編集・設定できる状態に戻ることを確認する。
