import { useState, useCallback } from 'react';
import { authClient } from '../api/client';

interface User {
  userId: string;
  email: string;
  role: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('hs_user');
    return stored ? (JSON.parse(stored) as User) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authClient.post('/v1/auth/login', { email, password });
      const { accessToken, refreshToken, userId, role } = res.data.data as {
        accessToken: string;
        refreshToken: string;
        userId: string;
        role: string;
      };

      // Validasi role: hanya COMMAND_CENTER dan ADMIN yang boleh masuk
      if (role !== 'COMMAND_CENTER' && role !== 'ADMIN') {
        setError('Akses ditolak. Akun ini tidak memiliki izin untuk Command Center.');
        throw new Error('Forbidden role');
      }

      localStorage.setItem('hs_access_token', accessToken);
      localStorage.setItem('hs_refresh_token', refreshToken);
      const userData: User = { userId, email, role };
      localStorage.setItem('hs_user', JSON.stringify(userData));
      setUser(userData);
      return userData;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      // Jangan timpa pesan "Akses ditolak" yang sudah di-set di atas
      if (!error) {
        const msg = axiosErr.response?.data?.detail ?? 'Login gagal';
        setError(msg);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [error]);

  const logout = useCallback(() => {
    localStorage.removeItem('hs_access_token');
    localStorage.removeItem('hs_refresh_token');
    localStorage.removeItem('hs_user');
    setUser(null);
  }, []);

  const isAuthenticated = !!user;
  return { user, loading, error, login, logout, isAuthenticated };
}
