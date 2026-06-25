import { Injectable } from '@nestjs/common';
import { AuthGuard }  from '@nestjs/passport';

@Injectable()
export class ClientJwtRefreshGuard extends AuthGuard(
	'client-jwt-refresh' ) {}
