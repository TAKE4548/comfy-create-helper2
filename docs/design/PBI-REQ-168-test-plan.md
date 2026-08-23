# PBI-REQ-168 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### Backend Tests
- **コマンド**: `pytest backend/tests/test_speech_bubble_presets.py -v`
- **対象ケース**:
  1. `test_create_and_list_speech_bubble_preset_with_effects`: 新規漫画演出パラメータ（`effects`）を含むプリセットの作成・取得テスト
  2. `test_update_speech_bubble_preset_effects`: `effects` フィールドの更新テスト
  3. `test_legacy_speech_bubble_preset_compatibility`: `effects_json` がない旧形式プリセットの自動マイグレーション・後方互換性テスト

### Frontend Unit & Render Tests
- **コマンド**: `npm --prefix frontend test -- speechBubbleRenderer.test.ts SpeechBubbleControls.test.tsx`
- **対象ケース**:
  1. `speechBubbleRenderer.test.ts`:
     - 縦書き時の特定文字90度回転（縦中横）描画の座標・回転計算
     - ダイナミックスケールカーブおよびサイズ揺らぎ（Jitter）の適用
     - パス軌道（直線、階段、波型、円弧）に沿った文字配置計算
     - グラデーション塗り、中抜き、トーンパターンのCanvas適用
     - 多層フチ（MultiStroke）の順次描画およびオフセット・角処理
     - 演出パラメータ（字間・行間・スケール・多重フチ・シアー）を反映した吹き出し自動サイズ計算（`calculateFitBubbleDimensions`）および自動フォントサイズ計算（`calculateFitFontSize`）
  2. `SpeechBubbleControls.test.tsx`:
     - 各種漫画演出パネル（タイポグラフィ、スケール、パス、カラー、多重フチ）の展開と操作連動
     - 縦中横クイック切り替えボタンの動作
     - 演出パラメータ変更に伴う吹き出しサイズ自動再計算動作
     - プリセット保存時の `effects` パラメータ包含と適用動作
     - 旧形式プリセット適用時のデフォルト値自動マージ動作

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: `python ${GLOBAL_SCRIPTS}\openapi_parser.py backend/openapi.json list-endpoints`
- **品質監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active`

## 3. 手動・UI動作検証 (Manual Verification)
1. スナップショット一覧またはアルバム詳細からセリフ編集モーダルを開く。
2. 縦書きセリフで「うわあああっ!?」と入力し、「!?」部分の90度回転（縦中横）が瞬時にプレビューへ反映されることを確認。
3. ダイナミックスケール（先頭大→末尾小）やサイズ揺らぎスライダーを操作し、文字サイズに動きが出ることを確認。
4. 多重フチを追加し、内側白・外側黒の2重アウトラインや影オフセットが綺麗に描画されることを確認。
5. 作成したスタイルを新規プリセット「叫び（インパクト）」として保存し、別セリフにワンクリックで適用できることを確認。
6. セリフを元画像解像度で正常に保存できることを確認。

