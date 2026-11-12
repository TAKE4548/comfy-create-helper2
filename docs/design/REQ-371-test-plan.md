# REQ-371 実行可能テスト計画: モバイルGenerate テキスト層被覆修正と固定方法見直し

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend && npm run typecheck`
- **期待値**: TypeScript 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `cd frontend && npm test`
- **局所検証コマンド (TDD実行時)**:
  - T1: `cd frontend && npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx -t "REQ-371"`
  - T2: `cd frontend && npx vitest run src/components/TagChipEditor/__tests__/TagChip.test.tsx -t "REQ-371"`
- **期待値**: 全テスト PASS (Exit code 0)。脳内推論代用は厳禁。

---

## 2. テスト配置計画 (Test Placement Plan [W-DD-PLACE])
チケット番号を含む新規テストファイルの新設は厳禁とし、既存のコロケーションテストファイルを拡張する：
1. **`frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`**:
   - `[REQ-371/AC-1]` テキスト層およびチップが不透明固定アクションバー（z-40）の背面を通過し透過しない検証
   - `[REQ-371/AC-2]` 固定生成バーのタップが確実にボタン自身で捕捉され、背面のテキスト／チップイベントを発火しない検証
   - `[REQ-371/AC-5]` 幅360px、セーフエリア付き環境でのボトムナビ（z-50）およびアクションバー（z-40）のレイアウト・余白整合検証
   - `[REQ-371/AC-8]` スクロール末尾余白への到達性と、キーボードフォーカス時の退避／復元動作の検証
2. **`frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx`**:
   - `[REQ-371/AC-3]` タグチップドラッグ中のインライン z-index が 30 であり、アクションバー（40）の背面を通過し並べ替えが完了する検証
   - `[REQ-371/AC-4]` 画面下部付近のチップでサブメニューを開いた際、上向き展開（`bottom-full mb-1.5`）へ切り替わり操作可能である検証
   - `[REQ-371/AC-6]` 共通 TagChipEditor 利用箇所（Tag Set 作成・編集等）における編集・削除・ドラッグ機能の非回帰検証
   - `[REQ-371/AC-7]` デスクトップ表示（幅768px以上）および通常配置におけるサブメニュー下向き展開の非回帰検証

---

## 3. テスト階層・受入基準マッピング (Execution Tiers & AC Mapping)

| ケース識別子 | 階層 (Tier) | 対象 AC | テスト内容 |
|---|---|---|---|
| `[REQ-371/AC-1]` | `integration` | AC-1 | プロンプト欄スクロール時、テキスト・チップが不透明な `mobile-action-bar` の手前に浮き上がらず背面に隠れること |
| `[REQ-371/AC-2]` | `integration` | AC-2 | `mobile-action-bar` の各ボタン（生成・保存・キュー）タップ時に背面要素のクリックが一切発火しないこと |
| `[REQ-371/AC-3]` | `unit` | AC-3 | ドラッグ中の `TagChip` の z-index が 30 に制御され、アクションバー（z-40）より下層でドラッグ移動・並べ替えができること |
| `[REQ-371/AC-4]` | `unit` | AC-4 | 画面下部境界付近の `TagChip` でサブメニューを開いた場合、上向き展開（Flip）されて全項目が操作可能であること |
| `[REQ-371/AC-5]` | `integration` | AC-5 | 画面幅360px、セーフエリア有効時、ボトムナビ（54px）とアクションバーが二重余白や隙間なく正確にスタック配置されること |
| `[REQ-371/AC-6]` | `unit` | AC-6 | 共有コンポーネントとしての `TagChip` の通常編集・削除・追加・無効化トグルが従来どおり動作すること |
| `[REQ-371/AC-7]` | `unit` | AC-7 | デスクトップ表示（幅768px以上）で従来のタグ表示・サブメニュー表示にレイアウト崩れが生じないこと |
| `[REQ-371/AC-8]` | `scenario` | AC-8 | プロンプト末尾までのスクロール到達性、および仮想キーボード退避フックとの連動が破綻しないこと |

---

## 4. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### RT-1: 固定生成バー高速連打時の背面イベント漏洩防御
- **対象**: `[REQ-371/AC-2] [RedTeam] RT-1`
- **手順**:
  1. プロンプト入力欄に複数行のテキストおよび複数のタグチップを配置し、アクションバー直下に背面要素が位置するスクロール状態を作成する。
  2. `mobile-action-bar` のボタン境界およびボタン本体に対して、高速（50ms間隔・20回連続）で pointerdown / click イベントを発火する。
- **期待結果**:
  - 生成アクションハンドラのみが規定回数発火し、直下のテキストエリア・チップ・削除ボタンには 1 回もイベントが貫通・漏洩しないこと。

### RT-2: 極小下部マージンにおけるサブメニュー Flip 境界値防御
- **対象**: `[REQ-371/AC-4] [RedTeam] RT-2`
- **手順**:
  1. チップの下端座標がビューポート下端からわずか 10px の位置（アクションバー完全に重複する領域）にある状態でサブメニュー展開イベントを発火する。
- **期待結果**:
  - サブメニューが例外（エラー）をスローすることなく上向き（`bottom-full mb-1.5`）に展開し、ビューポート上端突き破り・クリップを起こさず安定描画されること。

---

## 5. リスク評価と強制フルスイートフォールバック (Risk & Fallback Triggers)

- **リスク分類**: `low`
  - 理由: 本改修はクライアントサイドの CSS スタッキング階層（`z-index`）、背景不透明度、およびポップオーバー反転表示の UI インタラクション修正に限定されており、DBスキーマ、API通信契約、認証、共通基幹インフラへの変更を含まないため。
- **強制フルスイートフォールバック条件 (OR条件)**:
  以下のいずれか 1 つでも検出された場合、直ちに V2/Focused 判定を破棄し、V1 Baseline（Gate 2 全スイート無条件実行: `npm test`）へフォールバックする：
  1. `frontend/src/index.css` の `--z-mobile-nav` (50) や `--z-modal` (100) など既存共通トークン値が意図せず変更された場合。
  2. `AppShell.tsx`、`DesktopLayout.tsx` など担当外の基幹レイアウトファイルに変更が波及した場合。
  3. `TagChipEditor` の既存単体テスト（`TagChipEditor.test.tsx` 等）で 1 件でも回帰エラーまたはスキップ（skip）が発生した場合。
  4. テスト実行時にコレクション不一致、未キャッチの例外、またはモック漏洩が発生した場合。
