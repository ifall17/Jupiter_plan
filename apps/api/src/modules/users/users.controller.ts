import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
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
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { UsersService, CurrentUserPayload } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async list(
    @Req() req: Request,
    @Query('role') role?: UserRole,
    @Query('is_active') isActive?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    const currentUser = this.getCurrentUser(req);
    return this.usersService.listUsers({
      currentUser,
      role,
      is_active: this.parseBoolean(isActive),
      search,
      page: this.parsePositiveInt(page),
      limit: this.parsePositiveInt(limit),
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, OrgGuard)
  async me(@Req() req: Request): Promise<UserResponseDto> {
    return this.usersService.getMe(this.getCurrentUser(req));
  }

  @Patch('me/password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, OrgGuard)
  async changeMyPassword(@Req() req: Request, @Body() dto: ChangePasswordDto): Promise<{ success: true }> {
    return this.usersService.changeMyPassword(this.getCurrentUser(req), dto, this.extractIp(req));
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async getById(@Req() req: Request, @Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.getById(this.getCurrentUser(req), id);
  }

  @Post('invite')
  @HttpCode(201)
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async invite(@Req() req: Request, @Body() dto: InviteUserDto): Promise<UserResponseDto> {
    return this.usersService.inviteUser(this.getCurrentUser(req), dto, this.extractIp(req));
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateUser(this.getCurrentUser(req), id, dto, this.extractIp(req));
  }

  @Patch(':id/toggle')
  @Roles(UserRole.SUPER_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async toggle(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: true; is_active: boolean }> {
    return this.usersService.toggleUser(this.getCurrentUser(req), id, this.extractIp(req));
  }

  private getCurrentUser(req: Request): CurrentUserPayload {
    const user = req.user as CurrentUserPayload | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private parsePositiveInt(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return undefined;
    }
    return parsed;
  }

  private parseBoolean(value?: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return undefined;
  }

  private extractIp(request: Request): string {
    return (
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown'
    );
  }
}
