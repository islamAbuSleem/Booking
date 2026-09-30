/**
 * Mock-layer types.
 *
 * These are LOCAL to the frontend and exist only for Phase 1, where pages render from
 * fixtures with no API. They are deliberately shaped like the API responses described in
 * context/architecture.md, so swapping them is mechanical.
 *
 * DO NOT import these from components. T13a generates real types from openapi.json and
 * deletes this file. Components should type against the generated types, or against the
 * props of the components that consume them.
 */

export type Role = 'GUEST' | 'HOST' | 'ADMIN'
export type HotelStatus = 'PENDING' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED'
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'

export interface MockAmenity {
  id: string
  name: string
  icon: string
}

export interface MockImage {
  url: string
  alt: string
  aspect: '3:2' | '4:3' | '16:9' | '1:1'
}

export interface MockRoom {
  id: string
  hotelId: string
  name: string
  description: string
  bedType: string
  maxGuests: number
  totalInventory: number
  pricePerNightCents: number
  currency: 'USD'
  amenities: string[]
  images: MockImage[]
}

export interface MockReview {
  id: string
  hotelId: string
  authorName: string
  authorLocation: string
  rating: number
  title: string
  body: string
  createdAt: string
  status: 'VISIBLE' | 'HIDDEN'
}

export interface MockRatingBreakdown {
  cleanliness: number
  location: number
  comfort: number
  facilities: number
  staff: number
  average: number
  totalReviews: number
}

export interface MockHotel {
  id: string
  /** The user who may read this hotel's drafts. Ownership, not authorship. */
  hostId: string
  slug: string
  name: string
  city: string
  country: string
  addressLine: string
  lat: number
  lng: number
  starRating: number
  status: HotelStatus
  description: string
  checkInTime: string
  checkOutTime: string
  amenityIds: string[]
  images: MockImage[]
  rooms: MockRoom[]
  rating: MockRatingBreakdown
}

export interface MockUser {
  id: string
  name: string
  email: string
  role: Role
  avatarUrl: string
}

export interface MockBooking {
  id: string
  reference: string
  hotelId: string
  roomId: string
  guestName: string
  checkIn: string
  checkOut: string
  nights: number
  guestsCount: number
  subtotalCents: number
  feesCents: number
  totalCents: number
  currency: 'USD'
  status: BookingStatus
  createdAt: string
}

/** Every hotel detail page needs this; kept out of MockHotel to keep fixtures readable. */
export interface MockHotelDetail extends MockHotel {
  reviews: MockReview[]
}
