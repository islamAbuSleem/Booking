import { Inject, Injectable, Logger } from '@nestjs/common';
import { toPublicUser, type PublicUser } from './dto/user.dto.js';
import { USERS_REPOSITORY, type UsersRepository } from './users.repository.js';

/**
 * T14 — profile reads. Auth owns credentials and sessions; this service owns
 * "who is this id" so controllers never touch the repository directly.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  async findPublicById(id: string): Promise<PublicUser | null> {
    const user = await this.users.findById(id);
    if (!user) return null;
    this.logger.log(`[users] profile read ${user.id}`);
    return toPublicUser(user);
  }
}
