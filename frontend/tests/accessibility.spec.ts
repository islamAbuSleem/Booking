import { test, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

const staticPages = [
  { path: '/', name: 'Home' },
  { path: '/hotels', name: 'Hotels list' },
  { path: '/login', name: 'Login' },
  { path: '/register', name: 'Register' },
  { path: '/bookings', name: 'Bookings list' },
]

test.describe('Accessibility audit', () => {
  for (const pageConfig of staticPages) {
    test(`${pageConfig.name} has no accessibility violations`, async ({ page }) => {
      await page.goto(pageConfig.path)
      const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
      expect(accessibilityScanResults.violations).toEqual([])
    })
  }

  test('Hotel detail has no accessibility violations', async ({ page }) => {
    // Discover a valid hotel slug from the hotels list so the test is resilient
    // to data changes and 404s.
    await page.goto('/hotels')
    const firstHotelLink = page.locator('a[href^="/hotels/"]').first()
    const hotelExists = await firstHotelLink.count()
    test.skip(hotelExists === 0, 'No hotels exist yet — skipping detail audit')

    const hotelHref = await firstHotelLink.getAttribute('href')
    await page.goto(hotelHref!)
    const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
    expect(accessibilityScanResults.violations).toEqual([])
  })
})
