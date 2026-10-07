import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

const pages = [
  { path: '/', name: 'Home' },
  { path: '/hotels', name: 'Hotels list' },
  { path: '/hotels/the-larkspur-hotel', name: 'Hotel detail' },
  { path: '/login', name: 'Login' },
  { path: '/register', name: 'Register' },
  { path: '/bookings', name: 'Bookings list' },
]

test.describe('Accessibility audit', () => {
  for (const pageConfig of pages) {
    test(`${pageConfig.name} has no accessibility violations`, async ({ page }) => {
      await page.goto(pageConfig.path)
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
      expect(accessibilityScanResults.violations).toEqual([])
    })
  }
})
