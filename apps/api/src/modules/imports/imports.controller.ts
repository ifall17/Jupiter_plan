import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipeBuilder,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgGuard } from '../../common/guards/org.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ImportsCurrentUser, ImportsService, MAX_IMPORT_FILE_SIZE_BYTES } from './imports.service';

function importBadRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('upload')
  @Roles(UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR)
  @UseGuards(JwtAuthGuard, RolesGuard, OrgGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
          callback(importBadRequest('IMPORT_FILE_TYPE_INVALID', 'Only .xlsx MIME type is supported'), false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  async upload(
    @Req() req: Request,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_IMPORT_FILE_SIZE_BYTES })
        .build({
          fileIsRequired: true,
          exceptionFactory: () =>
            importBadRequest('IMPORT_FILE_TOO_LARGE', 'File too large'),
        }),
    )
    file: Express.Multer.File,
    @Body('period_id') periodId?: string,
  ) {
    const user = this.getCurrentUser(req);
    const job = await this.importsService.processImport(file, periodId, user.org_id, user.sub, this.getClientIp(req));
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

  private getClientIp(req: Request): string | undefined {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
      return forwardedFor.split(',')[0]?.trim() || req.ip;
    }
    return req.ip;
  }
}
