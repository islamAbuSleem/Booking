import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface Room {
  id: number;
  number: string;
  type: string;
  capacity: number;
  price: number;
  status: string;
}

export interface Booking {
  id: number;
  bookingReference: string;
  roomId: number;
  roomNumber: string;
  guestName: string;
  guestEmail: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  status: string;
  totalPrice: number;
}

export interface CreateBookingRequest {
  roomId: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  specialRequests?: string;
}

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const getRooms = async (): Promise<Room[]> => {
  const response = await api.get<Room[]>('/api/rooms');
  return response.data;
};

export const getAvailableRooms = async (
  checkIn: string,
  checkOut: string
): Promise<Room[]> => {
  const response = await api.get<Room[]>('/api/rooms/available', {
    params: { checkIn, checkOut },
  });
  return response.data;
};

export const createBooking = async (
  booking: CreateBookingRequest
): Promise<Booking> => {
  const response = await api.post<Booking>('/api/bookings', booking);
  return response.data;
};

export const getBookings = async (): Promise<Booking[]> => {
  const response = await api.get<Booking[]>('/api/bookings');
  return response.data;
};

export const getBooking = async (id: number): Promise<Booking> => {
  const response = await api.get<Booking>(`/api/bookings/${id}`);
  return response.data;
};

export const cancelBooking = async (id: number): Promise<void> => {
  await api.delete(`/api/bookings/${id}`);
};