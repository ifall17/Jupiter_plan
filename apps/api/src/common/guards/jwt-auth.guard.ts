import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

type JwtHeader = { alg?: string };
type JwtUser = { exp?: number };

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
	async canActivate(context: ExecutionContext): Promise<boolean> {
		try {
			const canActivate = (await super.canActivate(context)) as boolean;
			if (!canActivate) {
				throw new UnauthorizedException();
			}

			const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: JwtUser }>();
			const authHeader = request.headers.authorization;
			if (!authHeader?.startsWith('Bearer ')) {
				throw new UnauthorizedException();
			}

			const token = authHeader.slice('Bearer '.length).trim();
			const segments = token.split('.');
			if (segments.length !== 3) {
				throw new UnauthorizedException();
			}

			const headerJson = Buffer.from(segments[0], 'base64url').toString('utf8');
			const header = JSON.parse(headerJson) as JwtHeader;
			if (header.alg !== 'HS256') {
				throw new UnauthorizedException();
			}

			if (!request.user?.exp) {
				throw new UnauthorizedException();
			}

			return true;
		} catch {
			throw new UnauthorizedException();
		}
	}
}
