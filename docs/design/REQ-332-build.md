# REQ-332 配信用ビルド証跡

- 実施日: 2026-10-08（Asia/Tokyo）。リポジトリの `.agents/skills/build/SKILL.md` を使用。
- 作業ディレクトリ: `frontend`。実行: `npm run build`（`tsc -b && vite build`）。
- 通常sandboxではVite realpath EPERMで終了1。require_escalatedで再実行し終了0。
- Vite v5.4.21、2064 modules transformed、built in 9.76s。
- 生成: `frontend/dist/index.html`、`frontend/dist/assets/index-C46adOpC.js`、`frontend/dist/assets/index-DpZGI-BM.css`。実ファイル存在・非空を確認。
- 500 kB超のbundle size warningあり。エラーではなく、本件で新たなcode splitting変更は追加していない。
- バックエンド設定の既定値は `frontend_dist_dir = "../frontend/dist"`。`frontend_dist_path` は実在するパスを解決し、`frontend/dist` および `../frontend/dist` を代替探索する。起動コードはこの設定値を静的配信に使用する。
- 設定変更・バックエンド再起動は行っていない。生成物は追加ビルド証拠であり、全AC・実機Gate3のPASSを意味しない。
- ビルド後 `http://localhost:8000/` をIAB tab3で開き、DOMのscript srcが `/assets/index-C46adOpC.js` と一致。Generate・ワークフロー一覧が表示され、error/warnログは空配列。localStorageモニタ `29.3 KiB`、sessionStorage `0.0 KiB`。queueは0だったが、生成投入やプリセット変更は行っていない。

## ユーザー確認後のクローズ用ビルド

- 2026-10-08、ユーザーの「確認した。クローズして、ビルドしよう」に従い `npm run build` をrequire_escalatedで再実行。
- `tsc -b && vite build` 終了0。2064 modules transformed、built in 6.45s。
- `index.html`、`index-C46adOpC.js`、`index-DpZGI-BM.css` の存在・非空・更新時刻を再確認。出力hashは前回と同じ。
- 500kB超のbundle size warningは継続。ビルド失敗はなし。
- バックエンドの `frontend_dist_path` 設定と静的配信利用箇所を再確認。既定 `../frontend/dist` は今回の出力先に対応する。
- クローズはユーザーの受入確認に基づく。未取得の自動実機証拠や、監査の元判定を後付けのPASSへ変更しない。
