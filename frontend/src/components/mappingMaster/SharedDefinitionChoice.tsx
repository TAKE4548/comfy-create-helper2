import { useEffect, useId } from 'react'
import type { DefinitionKind, SharedChoice } from './variantDraft'

const BTN = 'min-h-[44px] md:min-h-0 touch-manipulation px-3 py-2 text-xs rounded-lg border'

export function SharedDefinitionChoice(props: {
  kind: DefinitionKind
  definitionName: string
  otherRoles: string[]
  onChoose(choice: SharedChoice): void
  onCancel(): void
}) {
  const { kind, definitionName, otherRoles, onChoose, onCancel } = props
  const titleId = useId()
  const label = kind === 'ruleSet' ? 'RuleSet' : 'NodeSelector'

  // The parent Modal disables its own Escape handling while this panel is shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      className="rounded-lg border border-yellow-600/60 bg-yellow-900/20 p-3 space-y-3 min-w-0 text-zinc-100"
    >
      <div id={titleId} className="text-xs font-semibold break-words">
        この{label}は他のroleからも参照されています
      </div>
      <div className="text-[11px] text-zinc-300 break-words">対象: {definitionName}</div>
      <ul className="flex flex-wrap gap-1.5 min-w-0 list-none p-0">
        {otherRoles.map((r) => (
          <li key={r} className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-mono break-all">
            {r}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChoose('update_shared')}
          className={`${BTN} border-[#7C6FDD] bg-[#7C6FDD] text-white`}
        >
          共有定義を更新
        </button>
        <button
          type="button"
          onClick={() => onChoose('duplicate_for_variant')}
          className={`${BTN} border-zinc-600 text-zinc-100`}
        >
          複製してこのVariantだけ変更
        </button>
        <button type="button" onClick={onCancel} className={`${BTN} border-zinc-700 text-zinc-300`}>
          戻る
        </button>
      </div>
    </div>
  )
}
