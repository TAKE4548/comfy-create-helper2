# インシデントレポート: REQ-229実装以降にノードバイパス機能が正常に動作しない不具合

## 1. 事象概要 (Overview)

ユーザーより以下の事象が報告された。
- 「229実装以降、バイパスが機能してない」

調査の結果、生成実行時（`handleGenerateSets`）においてバイパスプロファイルが有効（`is_enabled: true`）に設定されているにもかかわらず、ComfyUIへ送信されたワークフローJSONからバイパス対象ノードが一切削除されず、全ノード（91ノード）がそのまま実行される事象を確認した。

本事象は単一のコード不備ではなく、**バックエンドのエラー握りつぶし（HTTP 200返却）**、**フロントエンドの長時間キャッシュ（1時間staleTime）**、および**バイパス適用処理（`applyBypass`）のサイレントスキップ仕様**が連鎖して発生した実装上の不具合（Type A）である。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 観測された実行ログ（2026-09-08 23:36）:
1. **バイパスプロファイル更新**:
   - `2026-09-08T23:36:42.786+09:00` [req-9c34910298de]: `PUT /api/bypass-profiles/118` -> 200 OK
   - `2026-09-08T23:36:43.327+09:00` [req-f4ce441039cf]: `PUT /api/bypass-profiles/118` -> 200 OK
   - プロファイル118（`detailers`）が有効化され、バイパス対象ノード `["1283:1216", "1291:1221", "1297:1222", "1298:1223"]` が指定された。
2. **生成バッチ実行**:
   - `2026-09-08T23:36:44.799+09:00`: UIから生成ボタン（`handleGenerateSets`）が押下された。
   - `2026-09-08T23:36:44.875+09:00` [req-25d71cd26b51]: `POST /api/comfy/prompt` -> 200 OK
   - 投入プロンプトID: `fb6ad4ce-830d-4fa2-87ee-0fce8335d9fa`, `998f15f9-1bad-4cfd-a023-b1172077e86b`, `a8ff2bd8-1327-471c-b987-b94b6421db16`, `395571c2-f93e-4c03-a05c-9a108707929c`
3. **ComfyUI 実行履歴（History API）の検証結果**:
   - ComfyUI History API（`GET /history?max_items=5`）より、投入されたプロンプトJSONを検証したところ、バイパス指定されていたノード（`1283:1216` 等）およびプロファイル119のノード（`1345`, `1344` 等）を含む**全91ノードが1つもバイパスされずに残存**していた。

### 再現手順:
1. ComfyUIが未起動または起動途中の状態でアプリ（バックエンドおよびフロントエンド）にアクセスする。
2. その後ComfyUIが起動完了・接続状態となる。
3. ワークフロー57を選択し、バイパスプロファイル（例: `detailers` や `upscaler`）を有効化（トグルON）する。
4. 生成ボタンを押下して生成を実行する。
5. ComfyUI上でバイパス対象ノードがスキップされずにそのまま実行される。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 | 詳細 |
|---|---|---|---|
| 1 | `backend/app/routers/comfy.py` | L61-68 | ComfyUIへの `/object_info` 取得失敗時に例外をキャッチして `{}` を HTTP 200 OK で返却しており、エラー状態を正常レスポンスとして偽装している。 |
| 2 | `frontend/src/pages/GeneratePage/hooks/useWorkflowManagement.ts` | L46-50 | `useQuery(['comfy-object-info'], ...)` の `staleTime` が `1000 * 60 * 60`（1時間）に設定されており、空オブジェクト `{}` がキャッシュされると1時間再取得されない。ComfyUI再接続時のクエリ無効化も存在しない。 |
| 3 | `frontend/src/utils/bypassUtils.ts` | L68-80 | `comfyObjectInfo[classType]` が存在しない場合、安全策としてバイパス対象から除外（`continue`）され、有効対象が0件の場合は元のワークフローをそのまま返却する（エラー通知なしのサイレントスキップ）。 |
| 4 | `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` | L63-67 | `fetchParamSyncGroups` はページ初期化時に呼び出されているが、`fetchBypassProfiles` の呼び出しが `useGeneratePageState` に存在せず、`DesktopLayout` / `MobileLayout` 側に分散している。 |
| 5 | `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` | L84, L172 | `applyBypass` の戻り値検証や、スキーマ情報欠落時のユーザー通知（エラー表示やToast）が存在せず、未バイパスのままComfyUIへ投入されてしまう。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 発生メカニズム（連鎖した4つの要因）:

1. **バックエンドの異常時200返却によるフォールトマスキング (`backend/app/routers/comfy.py`)**:
   - `get_comfy_object_info_all` において、ComfyUIへの接続失敗時（起動直後や通信瞬断時）にエラーコード（502や503等）を返さず、空の辞書 `{}` をステータス200で返却している。
   - ログには `2026-09-08T23:33:41` および `23:34:08` に `Failed to fetch all object_info from ComfyUI: All connection attempts failed` が記録されていたが、クライアントには正常終了として扱われた。

2. **フロントエンド React Query による空データの1時間キャッシュ (`useWorkflowManagement.ts`)**:
   - クライアント側では `staleTime: 1000 * 60 * 60`（1時間）が指定されているため、一度空辞書 `{}` を受け取ると、その後ComfyUIが正常稼働しても1時間クエリが再実行されない。
   - また、WebSocketの接続状態（`isConnected`）復帰時に `comfy-object-info` を `invalidateQueries` する仕組みも欠落している。

3. **`applyBypass` によるサイレントスキップ (`bypassUtils.ts`)**:
   - `applyBypass` は、ノード定義スキーマ（入力／出力スロットの型情報）を参照して結線を安全にバイパス（ショートカット）する設計となっている。
   - `comfyObjectInfo` が空の場合、ノードクラス（`FaceDetailerPipe` 等）のスキーマが見つからないため、結線破壊を防ぐ安全ガードが作動してバイパス対象から除外される。
   - 結果として、`validBypassSet.size === 0` となり、**一切のバイパス処理が行われずに元のワークフローがそのまま返却される**。

4. **REQ-229 実装・再デプロイとの因果関係**:
   - REQ-229 の実装に伴うサーバー再起動・ブラウザ再読み込みのタイミングで、ComfyUI起動待機中にフロントエンドがアクセスしたことで空の `comfyObjectInfo` がキャッシュされた。
   - 加えて、プリセットポーリング（5秒間隔）や同期ロジック変更後も、この基盤キャッシュ破損状態が温存されたため、「229実装以降バイパスが動かない」という症状として顕在化した。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

- **分類**:
  - **Type A (Implementation Bug)**:
    - 仕様（REQ-091）ではバイパス設定が有効な場合、ComfyUI投入前にノードがバイパス・結線再構築されることが正当な仕様である。
    - バックエンドプロキシのフォールトマスキング、React Queryのキャッシュ管理不備、およびフロントエンドのサイレントスキップ処理という実装上の欠陥によって引き起こされている純粋な不具合である。

---

## 6. バックログ登録とルーティング提案 (Backlog Registration & Routing)

- **推奨対応**:
  - 本事象は原因コードおよび発生経路が特定された実装バグ（Type A）です。
  - 次のステップとして `/dev-design` に進み、修正設計およびタスクカードの作成を行うことを提案します。
- **次のワークフロー**: `/dev-design`

---

**ユーザー確認事項 (Approval Gate)**:
上記インシデントレポートの内容で合意いただける場合、PBIとしてバックログに登録し、`/dev-design` に進みますか？ (YES / NO)
