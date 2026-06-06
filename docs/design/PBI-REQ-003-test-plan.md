# PBI-REQ-003 実行可能テスト計画

## 1. 前提条件 (Setup & Environment)
- フロントエンド開発サーバーが起動可能であること。
- ブラウザのデベロッパーツール（またはアプリケーションタブ）で `localStorage` を確認・操作可能であること。

## 2. 自動テスト・検証 (CLI Verification)

### 2.1 静的型検査 (TypeScript Compilation)
実装コードのコンパイルエラーがないことを検証し、ログを出力して結果を確認します。
- **コマンド (PowerShell)**:
  ```powershell
  cd frontend
  npm run build > build_output.log 2>&1
  if ($LASTEXITCODE -ne 0) {
      Get-Content build_output.log -Tail 20
      Write-Error "FAIL: TypeScript compilation failed."
      exit 1
  } else {
      Write-Output "PASS: TypeScript compilation succeeded."
  }
  ```
- **期待値**: "PASS: TypeScript compilation succeeded." が出力され、`build_output.log` 内にエラーが記録されていないこと。

### 2.2 コードのリンター検証 (Linting)
コードスタイルおよび基本的な静的解析の問題がないか検証し、結果をログに保存します。
- **コマンド (PowerShell)**:
  ```powershell
  cd frontend
  npm run lint > lint_output.log 2>&1
  if ($LASTEXITCODE -ne 0) {
      Get-Content lint_output.log -Tail 20
      Write-Error "FAIL: Linter checks failed."
      exit 1
  } else {
      Write-Output "PASS: Linter checks passed."
  }
  ```
- **期待値**: "PASS: Linter checks passed." が出力され、`lint_output.log` 内にエラーが記録されていないこと。

## 3. ツール主導監査 (Tool-Driven Audit)
実施計画書や設計ドキュメントの形式とガバナンス整合性を検証します。
- **コマンド (PowerShell)**:
  ```powershell
  # 変数 GLOBAL_SCRIPTS は .agents/context.md で定義された値を使用
  # Windows環境: $env:GLOBAL_SCRIPTS
  python $env:GLOBAL_SCRIPTS\artifact_linter.py docs/backlog
  ```
- **期待値**: 出力に含まれる `<status>` タグの値が `PASS` であること。

## 4. 手動ブラウザ検証 (Browser Verification Plan)
- **対象URL**: `http://localhost:5173`
- **確認手順と確認事項 (Assertions)**:
  1. フロントエンド（`npm run dev`）を起動し、ブラウザで `http://localhost:5173` にアクセスする。
  2. デフォルトの表示状態を確認する。
     - **Assertion 1**: サイドバーが展開状態（通常幅 `w-56`）で表示され、ロゴテキスト「Prompt Surgeon」およびメニュー名が表示されていること。
  3. サイドバー最上部の折り畳みボタン（ID: `#sidebar-toggle`）をクリックする。
     - **Assertion 2**: サイドバーの幅がスムーズに縮小し、`w-16` になること。また、ロゴテキストおよびメニュー名が非表示になり、アイコンのみが中央に表示されていること。
     - **Assertion 3**: メインコンテンツ領域（レイアウト右側）が自動的に左側に拡大すること。
  4. ブラウザのデベロッパーツールを開き、コンソールで `window.localStorage.getItem('prompt-surgeon-sidebar-collapsed')` を実行して値を確認する。
     - **Assertion 4**: コンソールの出力結果が `"true"` であること。
  5. ページをリロード（再読み込み）する。
     - **Assertion 5**: リロード後もサイドバーが折り畳まれた状態（ミニバー状態）が維持されていること。
  6. 再度折り畳みボタンをクリックする。
     - **Assertion 6**: サイドバーがスムーズに元の展開状態（`w-56`）に戻り、コンソールで `window.localStorage.getItem('prompt-surgeon-sidebar-collapsed')` の値が `"false"` に更新されること。
