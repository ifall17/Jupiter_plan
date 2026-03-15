import { DEFAULT_PAGE_LIMIT } from '../constants/business.constants';
import { PaginatedResponseDto } from '../dto/paginated-response.dto';
import { PrismaService } from '../../prisma/prisma.service';

export abstract class BaseRepository<T> {
  protected constructor(protected readonly prisma: PrismaService) {}

  abstract findOne(id: string, orgId: string): Promise<T>;
  abstract findMany(orgId: string, page: number, limit: number): Promise<PaginatedResponseDto<T>>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, orgId: string, data: Partial<T>): Promise<T>;
  abstract softDelete(id: string, orgId: string): Promise<void>;

  protected paginate(page = 1, limit = DEFAULT_PAGE_LIMIT): { skip: number; take: number } {
    return {
      skip: (page - 1) * limit,
      take: limit,
    };
  }
}
