---
id: REQ-334-ac-coverage
title: REQ-334 AC・ロードマップ対応表
status: implementation
tags: [REQ-334, traceability]
related_paths:
  - docs/backlog/pbi/archive/REQ-334.md
  - docs/design/REQ-334.md
  - docs/design/REQ-334-contracts.md
  - implementation_plan.md
---

# REQ-334 AC Coverage Matrix

復元済みPBIのAC-01〜AC-102を1件ずつTask Card候補へ追跡する。割当IDは設計提案で、物理カード・実装所有path・DAGとの構造監査後に確定する。要件の延期・削除を承認する文書ではない。

## 20項目・4フェーズ

| Phase | Item | 対象 | AC IDs | Task IDs |
|---|---:|---|---|---|
| 1 | 1 | 入力上下split | 16, 17, 18 | REQ-334-T4, REQ-334-T5 |
| 1 | 2 | Queue/二段progress | 21, 22, 23, 24, 25, 33 | REQ-334-T5, REQ-334-T6, REQ-334-T7, REQ-334-T8, REQ-334-T56, REQ-334-T63, REQ-334-T79 |
| 1 | 3 | 取消安全性 | 14, 15, 34, 35, 36, 37, 38, 39 | REQ-334-T6, REQ-334-T9, REQ-334-T12, REQ-334-T13, REQ-334-T27, REQ-334-T28, REQ-334-T37, REQ-334-T38, REQ-334-T43, REQ-334-T63 |
| 1 | 4 | shortcuts/保存/外観 | 04, 06, 07, 08, 26, 27, 28, 40, 41 | REQ-334-T6, REQ-334-T7, REQ-334-T8, REQ-334-T15, REQ-334-T18, REQ-334-T26, REQ-334-T28, REQ-334-T31, REQ-334-T57, REQ-334-T64, REQ-334-T67, REQ-334-T68, REQ-334-T69, REQ-334-T75, REQ-334-T77, REQ-334-T80, REQ-334-T81 |
| 1 | 5 | 複数選択 | 09, 10, 11, 12, 13, 57, 58, 76, 80 | REQ-334-T11, REQ-334-T12, REQ-334-T13, REQ-334-T14, REQ-334-T38 |
| 2 | 6 | 並列preview | 19, 20 | REQ-334-T15 |
| 2 | 7 | Tablet | 01 | REQ-334-T2 |
| 2 | 8 | 縦長cards | 50, 51, 52, 53, 75 | REQ-334-T16, REQ-334-T47, REQ-334-T48 |
| 2 | 9 | 単語copy/専用drag | 54, 55, 56 | REQ-334-T17 |
| 2 | 10 | 拡大/比較 | 82, 83, 84, 85 | REQ-334-T18 |
| 3 | 11 | Mobile画像/進捗 | 02, 29, 30, 31 | REQ-334-T2, REQ-334-T8 |
| 3 | 12 | steppers | 32, 65, 67 | REQ-334-T19, REQ-334-T20, REQ-334-T21, REQ-334-T34, REQ-334-T35, REQ-334-T49 |
| 3 | 13 | bottom sheet/Action Bar | 03, 21, 22 | REQ-334-T3, REQ-334-T5, REQ-334-T7, REQ-334-T8, REQ-334-T62, REQ-334-T65, REQ-334-T66, REQ-334-T67, REQ-334-T69, REQ-334-T70, REQ-334-T71, REQ-334-T73 |
| 3 | 14 | LoRA登録/詳細 | 59, 60, 61, 62, 63, 64, 65 | REQ-334-T20, REQ-334-T34, REQ-334-T35, REQ-334-T50, REQ-334-T51, REQ-334-T52, REQ-334-T53, REQ-334-T54, REQ-334-T66 |
| 3 | 15 | AddAsset tray | 66, 67 | REQ-334-T21 |
| 3 | 16 | TagSet編集 | 68, 69, 70 | REQ-334-T13, REQ-334-T22 |
| 4 | 17 | Studio | 42, 43, 44, 45, 46, 47, 48, 49 | REQ-334-T23, REQ-334-T36 |
| 4 | 18 | Albums/History | 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 86 | REQ-334-T11, REQ-334-T14, REQ-334-T16, REQ-334-T24, REQ-334-T37, REQ-334-T38, REQ-334-T39, REQ-334-T60, REQ-334-T61, REQ-334-T62, REQ-334-T72 |
| 4 | 19 | Settings 5 tabs | 87, 88, 89, 90, 101, 102 | REQ-334-T25, REQ-334-T28, REQ-334-T33, REQ-334-T42, REQ-334-T43, REQ-334-T55, REQ-334-T64, REQ-334-T75, REQ-334-T76, REQ-334-T77, REQ-334-T78 |
| 4 | 20 | translation/Playground/service | 91, 92, 93, 94, 95, 96, 97, 98, 99, 100 | REQ-334-T9, REQ-334-T29, REQ-334-T30, REQ-334-T32, REQ-334-T40, REQ-334-T41, REQ-334-T42, REQ-334-T43, REQ-334-T44, REQ-334-T58, REQ-334-T59 |

## Cross-cutting documentation task

REQ-334-T10 is a cross-phase documentation/evidence integration task. It synchronizes the seven impacted `docs/specs` documents only after the corresponding behavior tasks finish; it has no independent functional AC and is therefore intentionally not repeated in every AC row.

## AC単位の完全追跡

| AC | Phase / behavior | Task IDs |
|---|---|---|
| AC-01 | Phase 2: Tablet navigation | REQ-334-T2 |
| AC-02 | Phase 3: Mobile safe area | REQ-334-T2, REQ-334-T8 |
| AC-03 | Phase 1: Common modal | REQ-334-T3, REQ-334-T65, REQ-334-T66, REQ-334-T67, REQ-334-T69, REQ-334-T70, REQ-334-T71, REQ-334-T73, REQ-334-T62 |
| AC-04 | Phase 1: global visual tokens | REQ-334-T57, REQ-334-T69 |
| AC-05 | Phase 1: 44px target size | REQ-334-T2, REQ-334-T3, REQ-334-T8, REQ-334-T21, REQ-334-T69, REQ-334-T66, REQ-334-T67, REQ-334-T70, REQ-334-T71, REQ-334-T73 |
| AC-06 | Phase 1: minimum type size | REQ-334-T57 |
| AC-07 | Phase 1: tabular numeric display | REQ-334-T57, REQ-334-T7, REQ-334-T8, REQ-334-T6 |
| AC-08 | Phase 1: icon system | REQ-334-T64, REQ-334-T68, REQ-334-T75, REQ-334-T77, REQ-334-T80, REQ-334-T81 |
| AC-09 | Phase 1: multi-select entry | REQ-334-T11, REQ-334-T12, REQ-334-T13, REQ-334-T38 |
| AC-10 | Phase 1: range selection | REQ-334-T11, REQ-334-T12, REQ-334-T13, REQ-334-T38 |
| AC-11 | Phase 1: filtered select all | REQ-334-T11, REQ-334-T12, REQ-334-T13, REQ-334-T38 |
| AC-12 | Phase 1: selected card state | REQ-334-T11, REQ-334-T12, REQ-334-T13, REQ-334-T38 |
| AC-13 | Phase 1: disable DnD while selected | REQ-334-T12, REQ-334-T13, REQ-334-T38 |
| AC-14 | Phase 1: confirmation before destructive action | REQ-334-T6, REQ-334-T9, REQ-334-T12, REQ-334-T13, REQ-334-T28, REQ-334-T37, REQ-334-T38, REQ-334-T43 |
| AC-15 | Phase 1: cancel preserves state | REQ-334-T6, REQ-334-T9, REQ-334-T12, REQ-334-T13, REQ-334-T28, REQ-334-T37, REQ-334-T38, REQ-334-T43 |
| AC-16 | Phase 1: Generate split | REQ-334-T4, REQ-334-T5 |
| AC-17 | Phase 1: persist split ratio | REQ-334-T4, REQ-334-T5 |
| AC-18 | Phase 1: maximize/restore split | REQ-334-T4, REQ-334-T5 |
| AC-19 | Phase 2: parallel preview counts | REQ-334-T15 |
| AC-20 | Phase 2: N-item page navigation | REQ-334-T15 |
| AC-21 | Phase 1: tablet Generate layout | REQ-334-T5, REQ-334-T7 |
| AC-22 | Phase 1: Action Bar reachability | REQ-334-T7, REQ-334-T8 |
| AC-23 | Phase 1: dual progress | REQ-334-T7, REQ-334-T8 |
| AC-24 | Phase 1: known/unknown ETA | REQ-334-T7, REQ-334-T8 |
| AC-25 | Phase 1: Queue pill | REQ-334-T7, REQ-334-T8 |
| AC-26 | Phase 1: Generate shortcut | REQ-334-T26 |
| AC-27 | Phase 1: image shortcut | REQ-334-T26, REQ-334-T18 |
| AC-28 | Phase 1: keyboard focus boundary | REQ-334-T26, REQ-334-T15, REQ-334-T18 |
| AC-29 | Phase 3: mobile preview frame | REQ-334-T8 |
| AC-30 | Phase 3: mobile progress | REQ-334-T8 |
| AC-31 | Phase 3: mobile segment state | REQ-334-T8 |
| AC-32 | Phase 3: step controls | REQ-334-T19, REQ-334-T21, REQ-334-T49 |
| AC-33 | Phase 1: job detail progress | REQ-334-T56, REQ-334-T63, REQ-334-T6, REQ-334-T79 |
| AC-34 | Phase 1: queued-only cancellation | REQ-334-T27, REQ-334-T6 |
| AC-35 | Phase 1: confirm all cancellation | REQ-334-T6 |
| AC-36 | Phase 1: protect other job types | REQ-334-T6 |
| AC-37 | Phase 1: partial/unknown cancellation result | REQ-334-T6 |
| AC-38 | Phase 1: 3-second reservation undo | REQ-334-T27, REQ-334-T63, REQ-334-T6 |
| AC-39 | Phase 1: commit reservation safely | REQ-334-T27, REQ-334-T63, REQ-334-T6 |
| AC-40 | Phase 1: connection labels | REQ-334-T7, REQ-334-T28 |
| AC-41 | Phase 1: translation shortcut | REQ-334-T31, REQ-334-T67 |
| AC-42 | Phase 4: Dataset Studio flow/review/autosave | REQ-334-T36 |
| AC-43 | Phase 4: Dataset Studio flow/review/autosave | REQ-334-T36 |
| AC-44 | Phase 4: Dataset Studio flow/review/autosave | REQ-334-T36 |
| AC-45 | Phase 4: Dataset Studio flow/review/autosave | REQ-334-T36 |
| AC-46 | Phase 4: Dataset Studio flow/review/autosave | REQ-334-T23 |
| AC-47 | Phase 4: Dataset Studio flow/review/autosave | REQ-334-T23 |
| AC-48 | Phase 4: Dataset Studio flow/review/autosave | REQ-334-T36 |
| AC-49 | Phase 4: Dataset Studio flow/review/autosave | REQ-334-T36 |
| AC-50 | Phase 2: LoRA/TagSet card visual | REQ-334-T47, REQ-334-T48 |
| AC-51 | Phase 2: LoRA/TagSet card visual | REQ-334-T47, REQ-334-T48 |
| AC-52 | Phase 2: LoRA/TagSet card visual | REQ-334-T47 |
| AC-53 | Phase 2: LoRA/TagSet card visual | REQ-334-T47, REQ-334-T48 |
| AC-54 | Phase 2: word copy and dedicated drag | REQ-334-T17 |
| AC-55 | Phase 2: word copy and dedicated drag | REQ-334-T17 |
| AC-56 | Phase 2: word copy and dedicated drag | REQ-334-T17 |
| AC-57 | Phase 3: bulk edit on asset collections | REQ-334-T12 |
| AC-58 | Phase 3: bulk edit on asset collections | REQ-334-T13 |
| AC-59 | Phase 3: LoRA create/detail editing | REQ-334-T20, REQ-334-T34, REQ-334-T35, REQ-334-T66 |
| AC-60 | Phase 3: LoRA create/detail editing | REQ-334-T20, REQ-334-T34, REQ-334-T35, REQ-334-T50, REQ-334-T51, REQ-334-T52, REQ-334-T53, REQ-334-T54 |
| AC-61 | Phase 3: LoRA create/detail editing | REQ-334-T20, REQ-334-T34, REQ-334-T35, REQ-334-T54 |
| AC-62 | Phase 3: LoRA create/detail editing | REQ-334-T20, REQ-334-T34, REQ-334-T35 |
| AC-63 | Phase 3: LoRA create/detail editing | REQ-334-T20 |
| AC-64 | Phase 3: LoRA create/detail editing | REQ-334-T20 |
| AC-65 | Phase 3: LoRA create/detail editing | REQ-334-T20, REQ-334-T34, REQ-334-T35 |
| AC-66 | Phase 3: AddAsset tray / strength | REQ-334-T21 |
| AC-67 | Phase 3: AddAsset tray / strength | REQ-334-T21 |
| AC-68 | Phase 3: TagSet parsing/subsets | REQ-334-T22, REQ-334-T13 |
| AC-69 | Phase 3: TagSet parsing/subsets | REQ-334-T22, REQ-334-T13 |
| AC-70 | Phase 3: TagSet parsing/subsets | REQ-334-T22, REQ-334-T13 |
| AC-71 | Phase 4: History/Albums listing and operations | REQ-334-T24 |
| AC-72 | Phase 4: History/Albums listing and operations | REQ-334-T16 |
| AC-73 | Phase 4: History/Albums listing and operations | REQ-334-T24 |
| AC-74 | Phase 4: History/Albums listing and operations | REQ-334-T16 |
| AC-75 | Phase 4: History/Albums listing and operations | REQ-334-T16 |
| AC-76 | Phase 4: History/Albums listing and operations | REQ-334-T11, REQ-334-T14 |
| AC-77 | Phase 4: History/Albums listing and operations | REQ-334-T60, REQ-334-T61, REQ-334-T37 |
| AC-78 | Phase 4: History/Albums listing and operations | REQ-334-T37, REQ-334-T38 |
| AC-79 | Phase 4: History/Albums listing and operations | REQ-334-T38, REQ-334-T72 |
| AC-80 | Phase 4: History/Albums listing and operations | REQ-334-T11, REQ-334-T14, REQ-334-T38 |
| AC-81 | Phase 4: History/Albums listing and operations | REQ-334-T38 |
| AC-82 | Phase 2: image zoom/compare | REQ-334-T18 |
| AC-83 | Phase 2: image zoom/compare | REQ-334-T18 |
| AC-84 | Phase 2: image zoom/compare | REQ-334-T18 |
| AC-85 | Phase 2: image zoom/compare | REQ-334-T18 |
| AC-86 | Phase 4: album quick-add flow | REQ-334-T39, REQ-334-T62 |
| AC-87 | Phase 4: Settings tabs / workflow settings | REQ-334-T25, REQ-334-T64 |
| AC-88 | Phase 4: Settings tabs / workflow settings | REQ-334-T28 |
| AC-89 | Phase 4: Settings tabs / workflow settings | REQ-334-T28, REQ-334-T55 |
| AC-90 | Phase 4: Settings tabs / workflow settings | REQ-334-T28 |
| AC-91 | Phase 4: Playground / token limit | REQ-334-T58, REQ-334-T59, REQ-334-T29 |
| AC-92 | Phase 4: Playground / token limit | REQ-334-T58, REQ-334-T59, REQ-334-T29 |
| AC-93 | Phase 4: dialogue/detection preview | REQ-334-T30 |
| AC-94 | Phase 4: dialogue/detection preview | REQ-334-T30 |
| AC-95 | Phase 4: dialogue/detection preview | REQ-334-T41, REQ-334-T59, REQ-334-T40 |
| AC-96 | Phase 4: translation test/dictionary | REQ-334-T42 |
| AC-97 | Phase 4: translation test/dictionary | REQ-334-T44, REQ-334-T59, REQ-334-T43 |
| AC-98 | Phase 4: service status/logs/operation results | REQ-334-T9, REQ-334-T32 |
| AC-99 | Phase 4: service status/logs/operation results | REQ-334-T9, REQ-334-T32 |
| AC-100 | Phase 4: service status/logs/operation results | REQ-334-T9, REQ-334-T32 |
| AC-101 | Phase 4: Settings system visual/save state | REQ-334-T33 |
| AC-102 | Phase 4: Settings system visual/save state | REQ-334-T33, REQ-334-T42, REQ-334-T43, REQ-334-T75, REQ-334-T76, REQ-334-T77, REQ-334-T78 |

## Integrity

- 102 unique AC IDs (01–102), no gaps; each AC has one or more task assignments.
- Cross-surface ACs map to the common behavior task plus affected surface integration tasks.
- Contract gaps are tracked as prerequisites in `REQ-334-contracts.md`; they do not convert requested ACs into deferred scope.
- REQ-334-T10/T45/T46 are cross-cutting documentation work and has no standalone AC. Final task IDs, file ownership, dependencies, and phase order must match physical Task Cards and `implementation_plan.md` before human approval.

## 実装時の追跡補正

実物所有pathに基づきAC単位表を補正済み。上部の20項目表もAC単位表から実行カードへ同期した。各行は対象責務の割当であり、AC合格の宣言ではない。focused test・mock APIのみを実画面の合格として転記しない。全カード完了後に幅767/768/1023/1024、390/800/1440/2560を含むGate3で検証する。

## 最終QA補正カード

T83–T105は画面実測・既存状態復元・キーボード・取消境界の補正。T106–T112はAC-70の各サブセット画像のモデル、移行028、API、非同期クロップ、保存・再訪・一括更新保持を担当する。T113はAC-82–85のパンと比較操作、T114はAC-72の名称検索、T115–T116はAC-08/12/78のアルバム操作、T118–T124はAC-04/08の残存アイコン・見出しと回帰テストを担当する。T117は仕様・OpenAPI・この追跡表の同期。カード完了はAC合格とは別で、最終判定は全体スイートとAC証跡表による。


## T125–T136 実測補正の追跡

AC-84:T125、AC-05:T126、AC-24:T127/T128、AC-08:T129/T136、AC-57:T130/T131、AC-07:T132/T133、AC-58:T130/T134、AC-15/32:T135。AC-70はHTTP create/list/updateと実画面クロップ・保存・再訪も照合した。Task Card完了とGate3合格は混同しない。


## T137–T145の追跡

AC-04/12:T137/T142/T143/T144、AC-50/53:T138、AC-03:T139/T140/T145、AC-05:T141。最終ブラウザーの具体値は受入証拠表とwalkthroughに記録。
