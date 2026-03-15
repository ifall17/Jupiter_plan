import { BadRequestException, Body, Controller, Get, Param, Post, Req, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ImportsCurrentUser, ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('upload')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async upload(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
    @Body('period_id') periodId: string,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    if (!periodId) {
      throw new BadRequestException('period_id is required');
    }

    const user = this.getCurrentUser(req);
    const job = await this.importsService.processImport(file, periodId, user.org_id, user.sub);
    return job;
  }

  @Get(':jobId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async getJob(@Req() req: Request, @Param('jobId') jobId: string) {
    return this.importsService.getJob(jobId, this.getCurrentUser(req));
  }

  private getCurrentUser(req: Request): ImportsCurrentUser {
    const user = req.user as ImportsCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
