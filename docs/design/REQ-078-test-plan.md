# PBI-REQ-078 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: なし（Fullscreen API およびタッチ/スワイプジェスチャー等のブラウザUIインタラクションが主体の機能のため、自動ユニットテストによる検証は行わず、実機ブラウザ動作の検証で担保します）

## 2. ツール主導監査 (Tool-Driven Audit)
- **ドキュメント監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/` を実行し、出力ログに `ERROR` または `WARN` が含まれていないことを確認。

## 3. ブラウザ検証・手動検証 (脳内シミュレーション防止用のDOM構造・数値基準)
AIが「目視で確認した」と報告することを防ぐため、以下の具体的なDOM状態およびJavaScriptの評価（またはコンソール出力・デベロッパーツール上の値）の客観的証拠を元に検証します。

- **検証環境**: Chrome デベロッパーツール（タブレット/モバイル表示エミュレート、PC表示）
- **検証手順および判定基準 (Assertion)**:
  
  ### 3.1 一覧画面での検証
  1. アプリケーションを起動し、任意のサムネイルをクリックして通常プレビューを開く。
     - **確認**: 通常モーダルが表示されること（DOM内に `fixed inset-0 z-[100] bg-black/95 flex flex-col` クラスを持つ要素が生成されていること）。
  2. 画像領域をタップ/クリックして全画面化する。
     - **確認**: コンソールで `document.fullscreenElement` もしくは `document.webkitFullscreenElement` が非 `null` であること。
  3. 全画面状態のまま、左右キー（PC）またはスワイプ操作（モバイル）で前後の画像をめくる。
     - **確認**: `img` タグの `src` 属性、またはインジケーターテキスト（例：`2 / 5` など）のDOMテキスト値が正しく変化していること。
  4. 全画面状態で、閉じるボタン（✕）をクリックするか、`Esc` キーを押す。
     - **確認**: 全画面が終了し、かつプレビューモーダル自体（手順1の最外枠DOM要素）が完全にDOMから削除されて非表示になること。
  5. 再度プレビューを開き、画像をクリックして全画面化し、今度は画像を再タップして全画面を解除する。
     - **確認**: 全画面が終了すると同時に、同様にプレビューモーダルも完全にクローズされること。

  ### 3.2 生成画面での検証
  1. 生成画面（GeneratePage）に移動し、生成完了画像をクリックしてプレビューを開き、上記 3.1 と同様の動作（全画面移行、めくり、解除時のクローズ）が一貫して正しく動作することを確認。

  ### 3.3 アスペクト比・レイアウトの数値基準
  - プレビュー対象の画像が全画面表示された状態で、ブラウザのデベロッパーツールで画像要素の `getBoundingClientRect()` もしくはスタイルを確認。
  - **検証用スクリプト (ブラウザコンソールで実行)**:
    ```javascript
    const img = document.querySelector('img[alt^="Preview"]');
    if (img) {
      const rect = img.getBoundingClientRect();
      const renderedRatio = rect.width / rect.height;
      const naturalRatio = img.naturalWidth / img.naturalHeight;
      const diff = Math.abs(renderedRatio - naturalRatio) / naturalRatio;
      console.log(`Rendered aspect ratio: ${renderedRatio}, Natural: ${naturalRatio}, Diff: ${(diff * 100).toFixed(2)}%`);
      // 許容誤差 ±0.5% 以内であることをアサート
      console.assert(diff <= 0.005, "Image aspect ratio is distorted!");
    } else {
      console.error("Preview image not found in DOM");
    }
    ```
