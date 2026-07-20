import { notImplemented } from '@/utils/httpError';

export class UsersService {
  listUsers() {
    return notImplemented('UsersService.listUsers');
  }
}

export const usersService = new UsersService();

