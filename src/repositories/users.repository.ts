import { BaseRepository } from '@/repositories/base.repository';

export class UsersRepository extends BaseRepository {
  constructor() {
    super('users');
  }
}

export const usersRepository = new UsersRepository();

