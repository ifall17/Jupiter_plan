import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BudgetStatus, Prisma } from '@prisma/client';
import { AuditAction, UserRole } from '@shared/enums';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { AuditService } from '../../common/services/audit.service';
import { BudgetsRepository, RepoBudget } from './budgets.repository';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetLineDto } from './dto/update-budget-line.dto';
import { RejectBudgetDto } from './dto/reject-budget.dto';
import { BudgetResponseDto } from './dto/budget-response.dto';

const BUDGET_ERROR_CODES = {
  BUDGET_LOCKED: 'BUDGET_LOCKED',
  BUDGET_NOT_SUBMITTABLE: 'BUDGET_NOT_SUBMITTABLE',
  BUDGET_NOT_APPROVABLE: 'BUDGET_NOT_APPROVABLE',
  REJECTION_COMMENT_REQUIRED: 'REJECTION_COMMENT_REQUIRED',
} as const;

export interface BudgetCurrentUser {
  sub: string;
  org_id: string;
  role: UserRole;
  email: string;
  department_scope?: Array<{ department: string; can_read: boolean; can_write: boolean }>;
}

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    private readonly budgetsRepository: BudgetsRepository,
    private readonly auditService: AuditService,
    @InjectQueue('calc-queue') private readonly calcQueue: Queue,
  ) {}

  async listBudgets(params: {
    currentUser: BudgetCurrentUser;
    fiscal_year_id?: string;
    status?: BudgetStatus;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponseDto<BudgetResponseDto>> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const { items, total } = await this.budgetsRepository.findPaginated({
      org_id: params.currentUser.org_id,
      fiscal_year_id: params.fiscal_year_id,
      status: params.status,
      skip,
      take: limit,
    });

    return {
      data: items.map((budget) => this.toBudgetResponse(budget)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBudgetById(currentUser: BudgetCurrentUser, budgetId: string): Promise<BudgetResponseDto> {
    const budget = await this.budgetsRepository.findByIdInOrg(budgetId, currentUser.org_id);
    if (!budget) {
      throw new NotFoundException();
    }

    return this.toBudgetResponse(this.filterByRoleAndDepartment(budget, currentUser));
  }

  async createBudget(
    currentUser: BudgetCurrentUser,
    dto: CreateBudgetDto,
    ipAddress?: string,
  ): Promise<BudgetResponseDto> {
    const version = await this.budgetsRepository.getNextVersion(currentUser.org_id, dto.fiscal_year_id);

    const budget = await this.budgetsRepository.create({
      org_id: currentUser.org_id,
      fiscal_year_id: dto.fiscal_year_id,
      name: dto.name.trim(),
      version,
      status: BudgetStatus.DRAFT,
    });

    await this.auditService.createLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.BUDGET_CREATE,
      entity_type: 'BUDGET',
      entity_id: budget.id,
      ip_address: ipAddress,
      metadata: {
        from_status: null,
        to_status: BudgetStatus.DRAFT,
      },
    });

    return this.toBudgetResponse(budget);
  }

  async updateLines(
    currentUser: BudgetCurrentUser,
    budgetId: string,
    dto: UpdateBudgetLineDto,
  ): Promise<BudgetResponseDto> {
    const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);

    if (budget.status === BudgetStatus.LOCKED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
    }

    if (budget.status !== BudgetStatus.DRAFT && budget.status !== BudgetStatus.REJECTED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_SUBMITTABLE });
    }

    if (currentUser.role === UserRole.CONTRIBUTEUR) {
      const allowedDepartments = await this.budgetsRepository.getContributorDepartments(currentUser.sub);
      const unauthorized = dto.lines.some((line) => !allowedDepartments.includes(line.department));
      if (unauthorized) {
        throw new NotFoundException();
      }
    }

    await this.budgetsRepository.upsertBudgetLines(
      budget.id,
      currentUser.org_id,
      currentUser.sub,
      dto.lines,
    );

    const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
    return this.toBudgetResponse(this.filterByRoleAndDepartment(refreshed, currentUser));
  }

  async submitBudget(
    currentUser: BudgetCurrentUser,
    budgetId: string,
    ipAddress?: string,
  ): Promise<BudgetResponseDto> {
    const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);

    if (budget.status === BudgetStatus.LOCKED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
    }

    if (budget.status !== BudgetStatus.DRAFT && budget.status !== BudgetStatus.REJECTED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_SUBMITTABLE });
    }

    await this.budgetsRepository.setStatus(budget.id, currentUser.org_id, {
      status: BudgetStatus.SUBMITTED,
      submitted_at: new Date(),
      submitted_by: currentUser.sub,
    });

    await this.auditService.createLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.BUDGET_SUBMIT,
      entity_type: 'BUDGET',
      entity_id: budget.id,
      ip_address: ipAddress,
      metadata: {
        from_status: budget.status,
        to_status: BudgetStatus.SUBMITTED,
      },
    });

    const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
    return this.toBudgetResponse(this.filterByRoleAndDepartment(refreshed, currentUser));
  }

  async approveBudget(
    currentUser: BudgetCurrentUser,
    budgetId: string,
    ipAddress?: string,
  ): Promise<BudgetResponseDto> {
    const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);

    if (budget.status === BudgetStatus.LOCKED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
    }

    if (budget.status !== BudgetStatus.SUBMITTED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_APPROVABLE });
    }

    await this.budgetsRepository.setStatus(budget.id, currentUser.org_id, {
      status: BudgetStatus.APPROVED,
      approved_at: new Date(),
      approved_by: currentUser.sub,
    });

    await this.calcQueue.add(
      'budget-approved-recalc',
      { org_id: currentUser.org_id, budget_id: budget.id },
      { removeOnComplete: 100, removeOnFail: 100 },
    );

    await this.auditService.createLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.BUDGET_APPROVE,
      entity_type: 'BUDGET',
      entity_id: budget.id,
      ip_address: ipAddress,
      metadata: {
        from_status: budget.status,
        to_status: BudgetStatus.APPROVED,
      },
    });

    const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
    return this.toBudgetResponse(refreshed);
  }

  async rejectBudget(
    currentUser: BudgetCurrentUser,
    budgetId: string,
    dto: RejectBudgetDto,
    ipAddress?: string,
  ): Promise<BudgetResponseDto> {
    const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);

    if (budget.status === BudgetStatus.LOCKED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
    }

    if (budget.status !== BudgetStatus.SUBMITTED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_APPROVABLE });
    }

    if (!dto.rejection_comment?.trim()) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.REJECTION_COMMENT_REQUIRED });
    }

    await this.budgetsRepository.setStatus(budget.id, currentUser.org_id, {
      status: BudgetStatus.REJECTED,
      rejection_comment: dto.rejection_comment.trim(),
    });

    await this.auditService.createLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.BUDGET_REJECT,
      entity_type: 'BUDGET',
      entity_id: budget.id,
      ip_address: ipAddress,
      metadata: {
        from_status: budget.status,
        to_status: BudgetStatus.REJECTED,
      },
    });

    const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
    return this.toBudgetResponse(refreshed);
  }

  async lockBudget(
    currentUser: BudgetCurrentUser,
    budgetId: string,
    ipAddress?: string,
  ): Promise<BudgetResponseDto> {
    const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);

    if (budget.status === BudgetStatus.LOCKED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_LOCKED });
    }

    if (budget.status !== BudgetStatus.APPROVED) {
      throw new BadRequestException({ code: BUDGET_ERROR_CODES.BUDGET_NOT_APPROVABLE });
    }

    await this.budgetsRepository.setStatus(budget.id, currentUser.org_id, {
      status: BudgetStatus.LOCKED,
      locked_at: new Date(),
      locked_by: currentUser.sub,
    });

    await this.auditService.createLog({
      org_id: currentUser.org_id,
      user_id: currentUser.sub,
      action: AuditAction.BUDGET_LOCK,
      entity_type: 'BUDGET',
      entity_id: budget.id,
      ip_address: ipAddress,
      metadata: {
        from_status: budget.status,
        to_status: BudgetStatus.LOCKED,
      },
    });

    const refreshed = await this.ensureOwnedBudget(budget.id, currentUser.org_id);
    return this.toBudgetResponse(refreshed);
  }

  async getVariance(currentUser: BudgetCurrentUser, budgetId: string): Promise<{
    budget_id: string;
    status: BudgetStatus;
    lines: Array<{
      line_id: string;
      period_id: string;
      account_code: string;
      account_label: string;
      department: string;
      amount_budget: string;
      amount_actual: string;
      variance: string;
      variance_pct: string;
    }>;
  }> {
    const budget = await this.ensureOwnedBudget(budgetId, currentUser.org_id);

    const scoped = this.filterByRoleAndDepartment(budget, currentUser);

    return {
      budget_id: scoped.id,
      status: scoped.status,
      lines: scoped.budget_lines.map((line) => {
        const variance = line.amount_actual.minus(line.amount_budget);
        const variancePct = line.amount_budget.equals(0)
          ? new Prisma.Decimal(0)
          : variance.div(line.amount_budget).mul(100);

        return {
          line_id: line.id,
          period_id: line.period_id,
          account_code: line.account_code,
          account_label: line.account_label,
          department: line.department,
          amount_budget: line.amount_budget.toString(),
          amount_actual: line.amount_actual.toString(),
          variance: variance.toString(),
          variance_pct: variancePct.toFixed(2),
        };
      }),
    };
  }

  private async ensureOwnedBudget(budgetId: string, orgId: string): Promise<RepoBudget> {
    const budget = await this.budgetsRepository.findByIdInOrg(budgetId, orgId);
    if (!budget) {
      throw new NotFoundException();
    }
    return budget;
  }

  private filterByRoleAndDepartment(budget: RepoBudget, currentUser: BudgetCurrentUser): RepoBudget {
    if (currentUser.role !== UserRole.CONTRIBUTEUR) {
      return budget;
    }

    const allowedDepartments = new Set(
      (currentUser.department_scope ?? [])
        .filter((scope) => scope.can_read)
        .map((scope) => scope.department),
    );

    const filteredLines = budget.budget_lines.filter((line) => allowedDepartments.has(line.department));

    return {
      ...budget,
      budget_lines: filteredLines,
    };
  }

  private toBudgetResponse(budget: RepoBudget): BudgetResponseDto {
    return {
      id: budget.id,
      name: budget.name,
      status: budget.status,
      version: budget.version,
      fiscal_year_id: budget.fiscal_year_id,
      submitted_at: budget.submitted_at,
      submitted_by: budget.submitted_by,
      approved_at: budget.approved_at,
      approved_by: budget.approved_by,
      locked_at: budget.locked_at,
      rejection_comment: budget.rejection_comment,
      created_at: budget.created_at,
      lines: budget.budget_lines.map((line) => {
        const variance = line.amount_actual.minus(line.amount_budget);
        return {
          id: line.id,
          period_id: line.period_id,
          account_code: line.account_code,
          account_label: line.account_label,
          department: line.department,
          line_type: line.line_type as never,
          amount_budget: line.amount_budget.toString(),
          amount_actual: line.amount_actual.toString(),
          variance: variance.toString(),
        };
      }),
    };
  }
}
