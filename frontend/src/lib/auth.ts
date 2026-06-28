import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface AuthResponse {
  token: string;
  refreshToken: string;
}

export const setToken = (token: string) => {
  localStorage.setItem('token', token);
};

export const getToken = (): string | null => {
  return localStorage.getItem('token');
};

export const clearToken = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
};

export const isAuthenticated = (): boolean => {
  const token = getToken();
  return !!token;
};

export const register = async (data: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthResponse> => {
  const response = await axios.post<AuthResponse>(`${API_URL}/api/auth/register`, data);
  setToken(response.data.token);
  localStorage.setItem('refreshToken', response.data.refreshToken);
  return response.data;
};

export const login = async (data: {
  username: string;
  password: string;
}): Promise<AuthResponse> => {
  const response = await axios.post<AuthResponse>(`${API_URL}/api/auth/login`, data);
  setToken(response.data.token);
  localStorage.setItem('refreshToken', response.data.refreshToken);
  return response.data;
};

export const logout = () => {
  clearToken();
  window.location.href = '/login';
};

export const refreshToken = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return null;

  try {
    const response = await axios.post<AuthResponse>(`${API_URL}/api/auth/refresh`, {
      refreshToken,
    });
    setToken(response.data.token);
    localStorage.setItem('refreshToken', response.data.refreshToken);
    return response.data.token;
  } catch {
    clearToken();
    return null;
  }
};

// Axios interceptor to add token to requests
axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const newToken = await refreshToken();
      if (newToken) {
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return axios(error.config);
      }
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);