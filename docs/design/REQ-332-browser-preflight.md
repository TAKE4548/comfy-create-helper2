# REQ-332 デスクトップブラウザ起動確認

実施日: 2026-10-08（Asia/Tokyo）。実装中の起動確認であり、全ACの合格証拠ではない。

- 使用: Codex In-app Browser、CUA tab 2。
- 開発画面: `http://127.0.0.1:5173/`。Viteの実起動出力から取得。既存バックエンド `http://localhost:8000/` の配信成果物は更新していない。
- 変更前の同開発originではGenerateのlocalStorageモニタが `2.5 MiB`。
- factoryの旧APIキャッシュ除去修正・App接続の部分変更後にreload。DOM snapshotでlocalStorage `24.5 KiB`、sessionStorage `0.0 KiB`、ワークフロー一覧の表示を確認。
- `tab.dev.logs({levels:['error','warn'],limit:8})` は空配列。
- 初回navigateはtimeoutを返したが、直後のAX状態で開発画面への到達を確認。reload後の初回AXは一部テキスト未表示、その後のDOM snapshotで通常表示を確認した。
- 別セッションのComfyUI生成が稼働中（観測時Queue 3）。生成投入、ユーザーのプリセット変更、保存値の書換えは行っていない。
- 制御フィクスチャによる容量期待値比較、IDB内容・実クォータ・初回フレーム・actual mobileの確認は未実施。AC1/2/5/6等の完全PASSとは扱わない。
- 前後の生DOMにはユーザーのワークフロー名等が含まれるため、記録は確認に必要な表示量・状態だけへ限定した。
