# REQ-314 BA Audit: part 8/8
Audit this fragment of the complete design, test plan and all 14 Task Cards. Other definitions may be in other fragments; do not invent defects solely from missing context. State findings with exact artifact/task references. User browser tests are manual and excluded from autonomous checks; typecheck/Vitest remain. D1: six real prompt keys versus AC-4 seven is an explicit unresolved human decision. D2: Backend/LM Studio URL editing versus unchanged API/schema is an explicit unresolved human decision. Do not require approval bypass or falsely mark those AC passed. Review acceptance coverage, logical contradictions, ownership/dependencies, testability and actual new gaps.

  - frontend/src/components/SettingsComponents.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx
depends_on: []
---

# REQ-314-T9: マッピングマスターのモバイル縦積み

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/MappingMasterSection.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/components/SettingsComponents.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx`
依存: なし。所有 3 ファイル、実装＋局所テストの追加削除合計 275 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
interface MappingMaster { id: number; role: string; expected_class_types: string[] | null; param_name: string; input_type: 'textarea' | 'int' | 'float' | 'select' | 'lora_stack' | 'select_sampler' | 'select_scheduler' | 'boolean'; display_name: string; title_patterns: string[] | null; sort_order: number }
// SortableMasterRow({ mm, openEditModal, openDeleteModal, openCopyModal,
// isMultiSelectMode, isSelected, onClick, longPressHandlers }: SortableMasterRowProps)
// longPressHandlers: {onMouseDown:(e:React.MouseEvent)=>void;onMouseUp:()=>void;onMouseLeave:()=>void;onTouchStart:(e:React.TouchEvent)=>void;onTouchEnd:()=>void}
```

### Existing surgical context
出典: `frontend/src/components/SettingsComponents.tsx`（設計時点、27行）。新ファイルはこの既存契約に接続する。
```tsx
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      onMouseDown={longPressHandlers.onMouseDown}
      onMouseUp={longPressHandlers.onMouseUp}
      onMouseLeave={longPressHandlers.onMouseLeave}
      onTouchStart={longPressHandlers.onTouchStart}
      onTouchEnd={longPressHandlers.onTouchEnd}
      className={`transition-colors cursor-pointer select-none ${
        isMultiSelectMode && isSelected
          ? 'bg-[#3ECF8E]/10 border-l-2 border-[#3ECF8E] hover:bg-[#3ECF8E]/15'
          : 'hover:bg-white/[0.01]'
      }`}
    >
      <td className="px-3 py-3 text-zinc-600">
        <div className="flex items-center gap-2">
          {isMultiSelectMode && (
            <div className="w-[13px] h-[13px] border border-[rgba(255,255,255,0.15)] rounded flex items-center justify-center bg-zinc-800 flex-shrink-0">
```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] MappingMasterSectionのtableへsettings-mobile-tableクラス、SortableMasterRowの各tdへdata-labelと折返しclassを付ける。共通row変更はclass/ラベル追加のみ、Settings以外画面へCSS影響を出さない。
- [ ] DndContext/SortableContext/useSortable/ref/transform/drag listeners/key維持。全列（role,param_name,type,class_types,title_patterns,sort_orderなど現行列）の情報をモバイルでも失わない。
- [ ] 操作buttonsはaria-labelを対象名前付きにし、row選択/longpressとaction伝播を維持。別mobile mapの追加やDND stateの二重生成を避ける。

## Acceptance / Verification
編集/複製/削除ID・並替ペイロード・長押し・ラベル対応を検証。320/390pxのdrag/多選択はT12チェックリストを使ってユーザーが手動確認する。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx
```
