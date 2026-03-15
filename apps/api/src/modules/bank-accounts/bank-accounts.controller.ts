import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { UserRole } from '@shared/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { BankAccountsService, BankAccountCurrentUser } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { BankAccountResponseDto } from './dto/bank-account-response.dto';

@Controller('bank-accounts')
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async list(@Req() req: Request): Promise<BankAccountResponseDto[]> {
    return this.bankAccountsService.listActive(this.getCurrentUser(req));
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async create(@Req() req: Request, @Body() dto: CreateBankAccountDto): Promise<BankAccountResponseDto> {
    return this.bankAccountsService.create(this.getCurrentUser(req), dto);
  }

  @Patch(':id/balance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async updateBalance(
    @Req() req: Request,
    @Param('id') id: string,
    @Body('balance') balance: string,
  ): Promise<BankAccountResponseDto> {
    return this.bankAccountsService.updateBalance(this.getCurrentUser(req), id, balance, this.extractIp(req));
  }

  private getCurrentUser(req: Request): BankAccountCurrentUser {
    const user = req.user as BankAccountCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private extractIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown'
    );
  }
}
