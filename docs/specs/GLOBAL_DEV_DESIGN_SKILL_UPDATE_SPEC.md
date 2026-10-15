# グローバル dev-design スキル更新仕様書 (REQ-366)

## 目的
エージェント駆動開発（Antigravity SDD）において、UIアンチパターン（11px Floor、生vh、二重パディング等）の混入を防止しつつ、トークン浪費とコンテキスト汚染を根絶するため、グローバルスキル `dev-design/SKILL.md` に「UI 4大アーキタイプ分類とサージカル自動注入プロトコル」を追加する。

## グローバル skills/dev-design/SKILL.md への反映仕様

### 追記セクション: Phase 2 Task Card Pre-Generation Protocol 内
1. **UI 4大アーキタイプ分類 (Archetype Classification)**:
   - Architect はフロントエンド改修タスクの設計時、対象コンポーネントを以下の4大アーキタイプに分類する:
     - `Archetype 1: Modals & Overlays` (ダイアログ、ドロワー、ボトムシート、ポップオーバー)
     - `Archetype 2: Tabs / Chips / Grids` (タブ、フィルターチップ、カードグリッド、サムネイル一覧)
     - `Archetype 3: Forms & Controls` (テキスト入力、トグル、チェックボックス、ボタン)
     - `Archetype 4: Shell & Page Layout` (ページシェル、SplitPane、ヘッダー/フッター、コンテナ)
2. **Frontend タスク生成時 (AC-3 サージカル注入)**:
   - `subsystem: frontend` または UI/CSS を変更するタスクの Task Card を生成する際、Architect は分類されたアーキタイプに対応するプリセット制約および推奨クラス（Hit-Slop `before:absolute before:-inset-2`、ジェスチャー `touch-action: pan-y / manipulation`、チップ `shrink-0 whitespace-nowrap`、`overscroll-contain`、`min-w-0 flex-1 truncate` 等）を抽出し、Task Card の `<constraints>` タグ内にサージカル（局所的）に記述する。
   - SSoT原本（`docs/specs/SPEC_COMMON.md`）が存在する場合はそこからプリセットを読み込んで注入し、全アンチパターン集の一括ベタ書きは厳禁とする。
3. **Backend 単体タスク生成時 (AC-5 コンテキスト汚染ゼロ)**:
   - `subsystem: backend` のタスクの Task Card には、UIアンチパターンやUI制約を一切含めてはならない。
