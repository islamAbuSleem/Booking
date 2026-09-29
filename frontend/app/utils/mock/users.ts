import type { MockUser } from './types'

export const USERS: MockUser[] = [
  {
    id: 'usr_guest',
    name: 'Henrietta Vane',
    email: 'guest@example.com',
    role: 'GUEST',
    avatarUrl: 'https://picsum.photos/seed/avatar-guest/96/96',
  },
  {
    id: 'usr_host',
    name: 'C. Saint-Laurent',
    email: 'host@example.com',
    role: 'HOST',
    avatarUrl: 'https://picsum.photos/seed/avatar-host/96/96',
  },
  {
    id: 'usr_admin',
    name: 'Ines Cardoso',
    email: 'admin@example.com',
    role: 'ADMIN',
    avatarUrl: 'https://picsum.photos/seed/avatar-admin/96/96',
  },
]

export const CURRENT_USER = USERS[0]!
