"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const COMMENT_ENTITY_TYPES = ['SCENARIO', 'HYPOTHESIS'];
let CommentsService = class CommentsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(currentUser, entityType, entityId) {
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
    async create(currentUser, dto) {
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
    async remove(currentUser, commentId) {
        const comment = await this.prisma.comment.findFirst({
            where: {
                id: commentId,
                org_id: currentUser.org_id,
            },
            select: { id: true, user_id: true },
        });
        if (!comment) {
            throw new common_1.NotFoundException();
        }
        if (comment.user_id !== currentUser.sub) {
            throw new common_1.ForbiddenException('You can delete only your own comments');
        }
        await this.prisma.comment.delete({ where: { id: comment.id } });
        return { success: true };
    }
    normalizeEntityType(entityType) {
        const normalized = String(entityType ?? '').trim().toUpperCase();
        if (!COMMENT_ENTITY_TYPES.includes(normalized)) {
            throw new common_1.BadRequestException('Invalid entity_type');
        }
        return normalized;
    }
    async ensureEntityOwnership(orgId, entityType, entityId) {
        if (entityType === 'SCENARIO') {
            const scenario = await this.prisma.scenario.findFirst({
                where: { id: entityId, org_id: orgId },
                select: { id: true },
            });
            if (!scenario) {
                throw new common_1.NotFoundException();
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
            throw new common_1.NotFoundException();
        }
    }
    sanitizeCommentContent(content) {
        const trimmed = String(content ?? '').trim();
        if (!trimmed) {
            throw new common_1.BadRequestException('content is required');
        }
        const normalized = trimmed
            .replace(/[\u0000-\u001F\u007F]/g, '')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .slice(0, 1000);
        if (!normalized) {
            throw new common_1.BadRequestException('content is required');
        }
        return normalized;
    }
};
exports.CommentsService = CommentsService;
exports.CommentsService = CommentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CommentsService);
//# sourceMappingURL=comments.service.js.map