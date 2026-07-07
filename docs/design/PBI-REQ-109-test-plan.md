# PBI-REQ-109 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm run test` (または `npx vitest run src/test/uuid.test.ts` ※テスト環境がある場合)
- **期待値**: `generateUUID` の挙動（UUIDフォーマットに合致すること、複数回呼び出して重複しないこと、`randomUUID` がない環境でも動作すること）を検証するテストコードを `frontend/src/test/uuid.test.ts` に作成し、PASSすること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py .` を実行し、ルール違反がないことを確認する。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173/` (フロントエンド起動URL)
- **操作手順**:
  1. ブラウザの開発者ツール (F12) のコンソールを開く。
  2. コンソールで `Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true });` を実行し、`crypto.randomUUID` を無効化（非セキュアコンテキストを再現）する。
  3. アプリケーションで「Scene Generator」モーダルを開く。
  4. 新しいシーンを追加（Add Scene）し、順序を移動し、削除する。
- **判定基準 (Assertion)**:
  1. **コンソール検証**: `crypto.randomUUID` を無効化後、モーダルを開いた際、コンソールに `TypeError: window.crypto.randomUUID is not a function` 等のエラーログが出力されないこと。
  2. **DOM 検証**: モーダルを開いた後、モーダル内のヘッダー要素「Scene Generator」およびシーン入力エリア（各 `textarea` 等）が正常に描画され、DOM として取得可能なこと。
  3. **操作検証**: シーンを追加した際、入力欄が正しく増加すること。
- **必須エビデンス**:
  - `crypto.randomUUID` が `undefined` であることをコンソールで確認している状態のスクリーンショット。
  - その状態で Scene Generator モーダルが正常に表示され、エラーなく操作できている状態のスクリーンショット。


