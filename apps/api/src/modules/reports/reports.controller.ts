import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { UserRole } from '@shared/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ReportsCurrentUser, ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  async generate(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: GenerateReportDto,
  ): Promise<void> {
    const currentUser = this.getCurrentUser(req);
    const { buffer, filename, contentType } = await this.reportsService.generate(dto, currentUser.org_id);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  private getCurrentUser(req: Request): ReportsCurrentUser {
    const user = req.user as ReportsCurrentUser | undefined;
    if (!user?.sub || !user.org_id) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
