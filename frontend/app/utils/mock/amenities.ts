import type { MockAmenity, MockImage } from './types'

/**
 * Placeholder imagery from picsum. Seeds are stable, so a given hotel always renders the
 * same photograph across reloads and between the list and detail pages. Real imagery
 * arrives with Cloudinary in T21 — these are replaced then, and must never be committed
 * as content.
 */
export function image(seed: string, aspect: MockImage['aspect'], alt: string): MockImage {
  const sizes: Record<MockImage['aspect'], [number, number]> = {
    '3:2': [800, 533],
    '4:3': [800, 600],
    '16:9': [1200, 675],
    '1:1': [400, 400],
  }
  const [w, h] = sizes[aspect]
  return { url: `https://picsum.photos/seed/${seed}/${w}/${h}`, alt, aspect }
}

export const AMENITIES: MockAmenity[] = [
  { id: 'wifi', name: 'Wifi', icon: 'wifi' },
  { id: 'pool', name: 'Pool', icon: 'pool' },
  { id: 'parking', name: 'Parking', icon: 'car' },
  { id: 'breakfast', name: 'Breakfast included', icon: 'coffee' },
  { id: 'pets', name: 'Pet friendly', icon: 'paw' },
  { id: 'ac', name: 'Air conditioning', icon: 'snowflake' },
  { id: 'workspace', name: 'Workspace', icon: 'desk' },
  { id: 'gym', name: 'Gym', icon: 'dumbbell' },
  { id: 'spa', name: 'Spa', icon: 'flower' },
  { id: 'restaurant', name: 'Restaurant', icon: 'utensils' },
  { id: 'bar', name: 'Bar', icon: 'glass' },
  { id: 'shuttle', name: 'Airport shuttle', icon: 'plane' },
]

export const AMENITY_BY_ID = new Map(AMENITIES.map(a => [a.id, a]))
