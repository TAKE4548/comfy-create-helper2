import {test,expect} from '@playwright/test'

test('Studio mobile proposal shows five tabs and offline sample project',async ({page},info)=>{
  test.skip(!info.project.name.includes('mobile'),'Mobile Studio review')
  await page.goto('/studio?ui=proposal')
  await expect(page.getByTestId('project-selector')).toContainText('UI Review / Sample LoRA',{timeout:20000})
  const tabs=page.locator('[data-studio-tabs="true"] > button')
  await expect(tabs).toHaveCount(5)
  await page.getByTestId('studio-step-tab-2').click()
  await expect(page.getByTestId('curator-grid')).toBeVisible()
  await expect(page.getByTestId('curator-grid').locator('img').first()).toBeVisible()
  await page.getByTestId('studio-step-tab-3').click()
  await expect(page.locator('#studio-caption-heading')).toBeVisible()
  await page.getByTestId('studio-step-tab-4').click()
  await expect(page.getByTestId('training-config-panel')).toBeVisible()
  await page.getByTestId('open-post-training-evaluation').click()
  await expect(page.getByTestId('benchmark-matrix-table')).toBeVisible()
  await expect(page.locator('[data-testid^="benchmark-cell-"] img')).toHaveCount(12)
  await expect.poll(async()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})

test('Studio baseline retains existing navigation',async ({page},info)=>{
  test.skip(!info.project.name.includes('mobile'),'Mobile Studio review')
  await page.goto('/studio?ui=baseline')
  await expect(page.getByTestId('studio-step-tab-1')).toBeVisible()
  await expect(page.locator('[data-studio-tabs="true"]')).toHaveCount(0)
})
