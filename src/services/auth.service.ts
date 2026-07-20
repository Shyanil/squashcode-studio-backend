import { notImplemented } from '@/utils/httpError';

export class AuthService {
  login() {
    return notImplemented('AuthService.login');
  }

  logout() {
    return notImplemented('AuthService.logout');
  }

  getProfile() {
    return notImplemented('AuthService.getProfile');
  }
}

export const authService = new AuthService();

