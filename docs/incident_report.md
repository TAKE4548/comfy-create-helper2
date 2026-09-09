# インシデントレポート: server-manager 起動時における Frontend (Vite) の EPERM rmdir 起動エラー

## 1. 事象概要 (Overview)

ユーザーより以下の事象が報告された。
- 「server-managerで一括起動すると、FEがエラー吐くようになった」
- 発生エラー:
  ```text
  error when starting dev server:
  Error: EPERM: operation not permitted, rmdir 'frontend/node_modules/.vite/deps'
  ```

調査および実機検証の結果、以下の事実を確認した。
1. `frontend` ディレクトリ配下で手動起動（`npm run dev`）を行っても、同様に `Error: EPERM: operation not permitted, rmdir ...\frontend\node_modules\.vite\deps` が発生し、dev サーバーの起動が 100% 失敗する。
2. 対象パス `frontend/node_modules/.vite/deps` を確認したところ、内部にファイル（`_metadata.json` 等）が一切存在せず空洞化している。
3. Windows のファイル属性コマンド（`attrib /D`）で確認したところ、`frontend/node_modules/.vite/deps` および過去の一時ディレクトリ群（`deps_temp_*`）に `R` (Read-Only) 属性が付与されている。
4. Node.js の `fs.promises.rm(dir, { recursive: true, force: true })` は、Windows においてディレクトリ自体に `R` 属性が付与されている場合、ディレクトリ削除の `rmdir` システムコールで `ERROR_ACCESS_DENIED` (`EPERM: operation not permitted`) をスローして異常終了することが確認された。
5. 一度この状態に陥ると、Vite が起動するたびにキャッシュ削除を試みて `rmdir` で即時クラッシュするため、自律復旧できないデッドロック状態となっている。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### ログ確認結果:
- `scripts/inspect_logs.py --summary` および `--errors --tail 10` を実行して確認。
- `logs/app.jsonl` は Prompt Surgeon アプリケーション自体の稼働ログであり、本件の Vite 起動前段階（dev server 初期化フェーズ）のエラーは記録されない。
- Frontend プロセスのコンソール出力にて以下のスタックトレースが観測される。
  ```text
  > frontend@0.0.0 dev
  > vite

  error when starting dev server:
  Error: EPERM: operation not permitted, rmdir 'frontend/node_modules/.vite/deps'
  ```

### 再現手順:
1. `frontend/node_modules/.vite/deps` に `_metadata.json` が存在せず、ディレクトリに `R` 属性が存在する状態になる。
2. `tools/server-manager/server-manager.ps1 -Action start`（または `start_servers.bat`、あるいは `npm run dev`）を実行する。
3. Vite の `loadCachedDepOptimizationMetadata` がキャッシュメタデータを検出できず、古いキャッシュディレクトリの削除処理 `await fsp.rm(depsCacheDir, { recursive: true, force: true })` を呼び出す。
4. Windows の `rmdir` で `EPERM` が発生し、Vite がプロセス終了コード 1 で即座にクラッシュする。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行/箇所 | 詳細 |
|---|---|---|---|
| 1 | `frontend/node_modules/.vite/deps` | ディレクトリ属性・内容 | ディレクトリが空であり、かつ `R` (Read-Only) 属性が付与されているため、Node.js からの `rmdir` が拒否される。 |
| 2 | `frontend/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js` | L50630-L50661 | `loadCachedDepOptimizationMetadata`: キャッシュメタデータ（`_metadata.json`）が存在しない場合に `await fsp.rm(depsCacheDir, { recursive: true, force: true })` を実行するが、Windows では `R` 属性付きディレクトリに対して `rmdir` が失敗する。 |
| 3 | `frontend/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js` | L50761-L50785 | `runOptimizeDeps.commit`: キャッシュ退避先の一時ディレクトリ `deps_temp_*` も同様に `R` 属性により削除されず残存し続ける。 |
| 4 | `tools/server-manager/server-manager.ps1` | L137-L144, L276-L293 | `Stop-FrontendProcess` および `Start-FrontendProcess`: `Stop-Process -Force` による単純なプロセス強制終了が行われており、Vite の依存関係最適化中（ファイル書き込み中）に強制終了されるとキャッシュファイルの欠落や破損を招きやすい。また `cmd.exe` や子プロセスのツリー終了が考慮されていない。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 発生メカニズム:
1. **Windows NTFS における `R` 属性と Node.js `rmdir` の挙動差異**:
   - Windows において、フォルダに `R` (Read-Only) 属性が付与されている場合、OS 標準の `rmdir` API はアクセス拒否（Access Denied / EPERM）を返す。
   - Node.js の `fsp.rm(path, { recursive: true, force: true })` は内部のファイルを再帰的に削除できるものの、フォルダ自体の削除フェーズにおいて `rmdir` を呼び出すため、`R` 属性の付いた空フォルダが削除できず `EPERM: operation not permitted, rmdir` で例外を発生させる。
2. **キャッシュメタデータの欠落による削除トリガーの恒常発火**:
   - Vite は起動時に `node_modules/.vite/deps/_metadata.json` を読み込み、キャッシュが有効であれば削除処理を行わずに起動を継続する。
   - しかし、一度何らかの理由（プロセスの途中終了や手動介入等）で `_metadata.json` が欠落すると、Vite はキャッシュ無効と判定して必ず `await fsp.rm(depsCacheDir)` を実行する。
   - その結果、メカニズム 1 の `EPERM` が必ず発火し、起動処理が完了できず、永久に新しい `_metadata.json` も生成されないというデッドロックに陥る。
3. **server-manager のプロセス停止契機**:
   - `server-manager.ps1` の停止ロジックはポート 5173 をリッスンしているプロセスへの直接的な `Stop-Process -Force` であるため、Vite の起動処理や最適化処理の最中に一括再起動・停止が行われると、アトミック性が保たれずにキャッシュが破損・空洞化しやすい。

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
    - Windows 環境におけるフォルダ属性（Read-Only 属性）および `rmdir` 制約に対する不備、ならびにプロセス停止・キャッシュ管理の堅牢性不足に起因する実装上の問題。

---

## 6. バックログ登録とルーティング提案 (Backlog Registration & Routing)

- **課題概要**:
  - Windows 環境における Vite キャッシュディレクトリ（`.vite/deps`）の `R` 属性による起動クラッシュの解消。
  - キャッシュ破損時や強制終了時でも安全にリカバリ・起動できる仕組み、および server-manager 側のプロセス停止・起動手順の堅牢化。
- **推奨ワークフロー**: `/dev-design`

---

**ユーザー確認事項 (Approval Gate)**:
上記インシデントレポートの内容で合意いただける場合、PBIとしてバックログに登録し、`/dev-design` に進みますか？ (YES / NO)
