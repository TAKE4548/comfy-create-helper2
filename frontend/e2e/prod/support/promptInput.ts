import type { Locator, Page } from '@playwright/test'

export type Vp = 'desktop' | 'mobile'

/**
 * desktop(>=768px)=DesktopLayout uses `#prompt-positive`, mobile(<768px)=MobileLayout uses `#prompt-mobile-positive`
 * (MobileLayout.tsx:767 / DesktopLayout.tsx:532).
 */
export const PROMPT_ROOT_SELECTOR: Record<Vp, string> = {
  desktop: '#prompt-positive',
  mobile: '#prompt-mobile-positive',
}

export const promptRoot = (page: Page, vp: Vp): Locator => page.locator(PROMPT_ROOT_SELECTOR[vp])

/** Judgment point: the input operable in the default Chips Mode without any extra action (TagInput `<input type="text">`). */
export const PROMPT_CHIP_INPUT_SUFFIX = 'input[type="text"]'

export const promptChipInput = (page: Page, vp: Vp): Locator =>
  promptRoot(page, vp).locator(PROMPT_CHIP_INPUT_SUFFIX)

/** Full selector string recorded in measurement JSON (`judgment.selector`). */
export const promptChipInputSelector = (vp: Vp): string =>
  `${PROMPT_ROOT_SELECTOR[vp]} ${PROMPT_CHIP_INPUT_SUFFIX}`

/**
 * A textarea exists only after the "テキスト入力モード切替" button is pressed (TagChipEditor/index.tsx:392-394;
 * defaultTextMode=false). For later cases that verify retained input values.
 */
export async function switchPromptToTextMode(page: Page, vp: Vp): Promise<Locator> {
  await promptRoot(page, vp).getByRole('button', { name: 'テキスト入力モード切替' }).click()
  return promptRoot(page, vp).locator('textarea')
}
