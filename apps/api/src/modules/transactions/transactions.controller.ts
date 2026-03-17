import { Body, Controller, Get, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { LineType, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { ValidateBatchDto } from './dto/validate-batch.dto';
import { TransactionsCurrentUser, TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async list(
    @Req() req: Request,
    @Query('period_id') periodId?: string,
    @Query('department') department?: string,
    @Query('line_type') lineType?: LineType,
      @Query('ytd') ytd?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<TransactionResponseDto>> {
    return this.transactionsService.list({
      currentUser: this.getCurrentUser(req),
      period_id: periodId,
      department,
      line_type: lineType,
        ytd: ytd === 'true',
      page: this.parsePositiveInt(page),
      limit: this.parsePositiveInt(limit),
    });
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async create(@Req() req: Request, @Body() dto: CreateTransactionDto): Promise<TransactionResponseDto> {
    return this.transactionsService.create(this.getCurrentUser(req), dto);
  }

  @Patch('validate-batch')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async validateBatch(@Req() req: Request, @Body() dto: ValidateBatchDto): Promise<{ updated: number }> {
    return this.transactionsService.validateBatch(this.getCurrentUser(req), dto.ids);
  }

  private getCurrentUser(req: Request): TransactionsCurrentUser {
    const user = req.user as TransactionsCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private parsePositiveInt(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
  }
}
