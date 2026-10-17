# REQ-364: FE環境切替・ライフサイクル制御（起動/停止）およびヘッダーステータス稼働モニタ表示 テスト計画書

## 1. 概要とテスト戦略

本テスト計画は、REQ-364におけるフロントエンド開発環境インジケータータグ表示、システム稼働モニタポップオーバーの構造化・垂直整列、URLパラメータを保持した環境切替、および開発サーバーの起動・停止ライフサイクル要求機能の品質を保証するための計画である。
ゼロGPU・CPU/RAMのみで完結する高速なユニット・結合テストを設計し、外部通信はモック/スパイで切断する。

---

## 2. Test Placement Plan [MUST [W-DD-PLACE]]

新規にチケット番号（`*req*`, `*pbi*`）を含むテストファイルを作成することは厳禁とし、既存のコロケートテストファイルを拡張する。

| 対象機能 | 拡張対象既存テストファイル | テストケース識別子 |
|---|---|---|
| Dropdown ESCキー閉止 | `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | `[REQ-364/AC-3]` |
| 動的DEVタグ表示・非表示 | `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | `[REQ-364/AC-1]`, `[REQ-364/AC-2]` |
| ポップオーバー開閉・動的ポート整列 | `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | `[REQ-364/AC-3]`, `[REQ-364/AC-4]` |
| URL生成・動的遷移先切替ボタン | `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | `[REQ-364/AC-5]`, `[REQ-364/AC-6]` |
| 開発サーバー起動・停止要求アクション | `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | `[REQ-364/LC-1]`, `[REQ-364/LC-2]`, `[REQ-364/LC-3]` |
| 共通ヘッダー統合検証 | `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | `[REQ-364/E2E-Integration]` |

---

## 3. AC & Lifecycle トレーサビリティマトリクス

| 基準ID | Given-When-Then 仕様 | 対象テストファイル | 判定基準 |
|---|---|---|---|
| **AC-1** | Given 開発サーバー（:5173 またはカスタムポート:5174）で画面表示中, When PCデスクトップでバッジ領域が描画されるとき, Then 既存バッジ横に動的に「DEV :5173」（または「DEV :5174」）タグバッジが表示される | `SystemStatusBadge.test.tsx` | `screen.getByTestId('dev-indicator-tag')` が存在しテキスト `DEV :${currentPort}` であること |
| **AC-2** | Given 本番サーバー（:8000 またはカスタムポート）で画面表示中（isDev=false）, When バッジ領域が描画されるとき, Then 「DEV :ポート」タグバッジが表示されない | `SystemStatusBadge.test.tsx` | `screen.queryByTestId('dev-indicator-tag')` が `null` であること |
| **AC-3** | Given ヘッダー表示中, When バッジをクリックする, Then 「システム稼働モニタ」が展開され4サービスが表示。外側クリックまたはESC押下で閉じる | `SystemStatusBadge.test.tsx`, `HeaderDropdown.test.tsx` | クリックで Popover が開き、ESC押下または外側クリックで閉じること |
| **AC-4** | Given モニタ展開中, When 各行表示を確認するとき, Then 全サービス行の右端が動的ポートを含む統一フォーマット（running (:ポート)）で垂直整列する | `SystemStatusBadge.test.tsx` | Frontend, BE, ComfyUI, Manager の全行でポートが動的に反映され垂直整列すること |
| **AC-5** | Given 開発環境でパス・クエリ・ハッシュ付き画面でモニタ表示中, When Frontend行の「⇄ 本番用」をクリックする, Then パス・クエリ・ハッシュを保持し本番ポート（既定:8000または指定ポート）へ遷移する | `SystemStatusBadge.test.tsx` | 生成URLが `${protocol}//${hostname}:${targetProdPort}${pathname}${search}${hash}` と一致すること |
| **AC-6** | Given 本番環境でパス・クエリ・ハッシュ付き画面でモニタ表示中（FE稼働中）, When Frontend行の「⇄ 開発用」をクリックする, Then パス・クエリ・ハッシュを保持し開発ポート（既定:5173または指定ポート）へ遷移する | `SystemStatusBadge.test.tsx` | 生成URLが `${protocol}//${hostname}:${targetDevPort}${pathname}${search}${hash}` と一致すること |
| **LC-1** | Given 本番環境（!isDev）で開発サーバー停止中（fe.running=false）, When モニタを展開するとき, Then 「▶ 開発起動」ボタンが表示され、クリックで `systemManagerApi.action('start', 'frontend')` が呼ばれること | `SystemStatusBadge.test.tsx` | `systemManagerApi.action` が `('start', 'frontend')` 引数で1回呼び出されること |
| **LC-2** | Given アクション要求実行中（in flight）, When ボタン状態を確認するとき, Then ボタンが非活性（disabled）となりスピナーまたはローディング表示されること | `SystemStatusBadge.test.tsx` | 二重クリック不可、ローディング状態が可視化されること |
| **LC-3** | Given 開発環境（isDev）でモニタ表示中, When 「■ 停止して本番へ」ボタンをクリックする, Then `systemManagerApi.action('stop', 'frontend')` が呼ばれ、本番URLへ遷移すること | `SystemStatusBadge.test.tsx` | stop アクション呼び出しと `targetProdPort` への遷移が両方実行されること |

---

## 4. Red Team 境界値・動的ポート異常系テストシナリオ

### RT-1: 複雑なURLパラメータおよび日本語・特殊文字の保持性 (PBT / Table-driven)
- 対象: `buildSwitchUrl`
- 入力パターン:
  1. 通常URL: `/generate?workflow=1&model=flux#preview`
  2. ルートのみ: `/`（クエリなし、ハッシュなし）
  3. 特殊文字クエリ: `/dataset?query=%E3%83%86%E3%82%B9%E3%83%88&tag=cat&sort=desc#item-99`
  4. 空文字ハッシュ/クエリ混在: `/settings?#`
- 期待結果: すべてのケースでプロトコル、ホスト名、パス、クエリ、ハッシュが1文字の欠落なく対象ポートに正しく置換されること。

### RT-2: ポート番号変更・カスタムポート追従性の検証 (Dynamic Port Verification)
- 対象: `SystemStatusBadge`
- 状態パターン:
  1. 開発ポートが `5174` の場合: タグバッジが `DEV :5174` と表示され、Frontend行も `running (:5174)` となること。
  2. 本番ポートが `8080`、ComfyUIが `8288`、Managerが `8999` の場合: モニタ内の各行がそれぞれ `(:8080)`, `(:8288)`, `(:8999)` と正しく表示され、右側整列が崩れないこと。

### RT-3: ServerManager アクションエラー時のフォールトインジェクション
- 対象: `systemManagerApi.action` 呼び出し
- 状態パターン:
  1. 起動要求が HTTP 500 / タイムアウトで失敗した場合: ローディング状態が安全に解除され、コンポーネントがクラッシュしないこと。
  2. `managerAvailable: false`: 起動/停止ボタンが非活性となること。

---

## 5. 検証コマンド一覧

```bash
# 1. 型チェック
npm run typecheck

# 2. HeaderDropdown ESCキー閉止単体テスト
npm test -- HeaderDropdown.test.tsx -t "Escape"

# 3. SystemStatusBadge AC-1〜AC-6 およびライフサイクル単体テスト
npm test -- SystemStatusBadge.test.tsx -t "REQ-364"

# 4. 共通ヘッダー結合テスト
npm test -- unifiedHeaderIntegration.test.tsx -t "REQ-364"
```
