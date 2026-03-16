import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';

export interface CommentsCurrentUser {
  sub: string;
  org_id: string;
  role: string;
}

const COMMENT_ENTITY_TYPES = ['SCENARIO', 'HYPOTHESIS'] as const;

type CommentEntityType = (typeof COMMENT_ENTITY_TYPES)[number];

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(currentUser: CommentsCurrentUser, entityType: string, entityId: string) {
    const normalizedType = this.normalizeEntityType(entityType);
    await this.ensureEntityOwnership(currentUser.org_id, normalizedType, entityId);

    return this.prisma.comment.findMany({
      where: {
        org_id: currentUser.org_id,
        entity_type: normalizedType,
        entity_id: entityId,
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        org_id: true,
        user_id: true,
        entity_type: true,
        entity_id: true,
        content: true,
        created_at: true,
        updated_at: true,
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });
  }

  async create(currentUser: CommentsCurrentUser, dto: CreateCommentDto) {
    const normalizedType = this.normalizeEntityType(dto.entity_type);
    await this.ensureEntityOwnership(currentUser.org_id, normalizedType, dto.entity_id);

    const content = this.sanitizeCommentContent(dto.content);

    return this.prisma.comment.create({
      data: {
        org_id: currentUser.org_id,
        user_id: currentUser.sub,
        entity_type: normalizedType,
        entity_id: dto.entity_id,
        content,
      },
      select: {
        id: true,
        org_id: true,
        user_id: true,
        entity_type: true,
        entity_id: true,
        content: true,
        created_at: true,
        updated_at: true,
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });
  }

  async remove(currentUser: CommentsCurrentUser, commentId: string): Promise<{ success: true }> {
    const comment = await this.prisma.comment.findFirst({
      where: {
        id: commentId,
        org_id: currentUser.org_id,
      },
      select: { id: true, user_id: true },
    });

    if (!comment) {
      throw new NotFoundException();
    }

    if (comment.user_id !== currentUser.sub) {
      throw new ForbiddenException('You can delete only your own comments');
    }

    await this.prisma.comment.delete({ where: { id: comment.id } });

    return { success: true };
  }

  private normalizeEntityType(entityType: string): CommentEntityType {
    const normalized = String(entityType ?? '').trim().toUpperCase();
    if (!COMMENT_ENTITY_TYPES.includes(normalized as CommentEntityType)) {
      throw new BadRequestException('Invalid entity_type');
    }
    return normalized as CommentEntityType;
  }

  private async ensureEntityOwnership(orgId: string, entityType: CommentEntityType, entityId: string): Promise<void> {
    if (entityType === 'SCENARIO') {
      const scenario = await this.prisma.scenario.findFirst({
        where: { id: entityId, org_id: orgId },
        select: { id: true },
      });
      if (!scenario) {
        throw new NotFoundException();
      }
      return;
    }

    const hypothesis = await this.prisma.scenarioHypothesis.findFirst({
      where: {
        id: entityId,
        scenario: { org_id: orgId },
      },
      select: { id: true },
    });
    if (!hypothesis) {
      throw new NotFoundException();
    }
  }

  private sanitizeCommentContent(content: string): string {
    const trimmed = String(content ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('content is required');
    }

    const normalized = trimmed
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .slice(0, 1000);

    if (!normalized) {
      throw new BadRequestException('content is required');
    }

    return normalized;
  }
}
