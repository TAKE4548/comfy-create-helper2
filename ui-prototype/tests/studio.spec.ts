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

test('Studio export unlocks after all slots are confirmed and status labels stay singular',async ({page},info)=>{
 test.skip(!info.project.name.includes('mobile'))
 await page.goto('/studio?ui=proposal')
 await page.getByTestId('studio-step-tab-2').click()
 const exportButton=page.getByTestId('export-dataset-button')
 await expect(exportButton).toBeDisabled()
 const badges=page.locator('[data-studio-curator-status][data-studio-status="REJECTED"]')
 for(let i=0;i<6;i++){
   await badges.first().click()
 }
 await expect(page.locator('[data-studio-curator-progress]')).toContainText('確定 20 / 20枠')
 await expect(exportButton).toBeEnabled()
 const badge=page.locator('[data-studio-curator-status]').first()
 await expect(badge).toHaveAttribute('data-studio-status','APPROVED')
 await expect(badge).toHaveCSS('font-size','0px')
})
