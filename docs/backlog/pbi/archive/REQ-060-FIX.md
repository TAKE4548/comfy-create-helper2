---
id: REQ-060-FIX
status: done
tags: []
title: マッピング確認UIにおける候補ドロップダウン表示不具合の修正
---

### REQ-060-FIX: マッピング確認UIにおける候補ドロップダウン表示不具合の修正

- **Type**: defect
- **Status**: done (2026-08-30)
- **Current step**: none
- **Priority**: P1
- **Surface**: req060の反映で、マッピングマスタの項目毎の入力欄ができたが、直接入力しかできずマッピングした候補のドロップダウンになっていない。
- **Root Cause**: `useMasterMappingRows.ts` にて `matchedMap` にデータがある場合（1:1マッチまたは複数候補時のデフォルトマッチ時など）に `if (matched)` ブランチが先に評価されてしまい、警告（`duplicated` や `class_type_mismatch`）がある場合のブランチがスキップされ、`candidates` が空配列になっていた。
- **Requirement**: 
  - `matched` と `warning` の情報を統合し、警告（複数候補やクラス不一致など）が存在する場合は警告情報（`candidates` 等）を優先して反映する。
  - 1:1マッチ成功時（`ok`）でも、選択したノードID自身を候補（`candidates`）に含めることでドロップダウン選択肢を表示可能にする。
- **Acceptance criteria**: 
  - [ ] AC-1: マップスキャン時に複数候補がある場合、ステータスが `duplicated` となりドロップダウンに対象候補がすべて表示されること。
  - [ ] AC-2: マップスキャン時に1:1マッチした場合、ステータスが `ok` となり、初期値が選択されているかつドロップダウン候補にそのIDが表示されること。
  - [ ] AC-3: 直接キーボードから入力した値も正しくマッピングに適用・保存できること。
- **Design doc**: none
