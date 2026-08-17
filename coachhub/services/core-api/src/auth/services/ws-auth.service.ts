import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { ConfigService } from '../../config';
import { AuthPayload, ClientAuthPayload } from '../../common';

/**
 * Who is on the other end of a WebSocket, resolved from their access token.
 *
 * `tenantId` is the only field that is always present, and it is the one that
 * matters: it becomes the envelope's tenant, which is what ai-service scopes
 * its knowledge-base retrieval by. Everything else is request metadata.
 */
export interface WsPrincipal {
	tenantId: string;
	email: string;
	/** Set for coach (`tenant-user`) tokens, null for client tokens. */
	coachId: string | null;
	/** Set for client tokens, null for coach tokens. */
	clientId: string | null;
}

/**
 * Authenticates socket connections.
 *
 * The global `JwtAuthGuard` deliberately waves through every non-HTTP execution
 * context so RabbitMQ consumers aren't blocked — which means WebSocket handlers
 * are not authenticated by it either. Anything exposed over a socket has to
 * authenticate itself, and this is where that happens.
 */
@Injectable()
export class WsAuthService {
	constructor(
		private readonly jwt: JwtService,
		private readonly configService: ConfigService,
	) {}

	/**
	 * Reads the access token off the handshake.
	 *
	 * `auth.token` is the socket.io convention and the only one browsers can use
	 * — the WebSocket API cannot set request headers. The `Authorization` header
	 * is accepted as well for non-browser clients (tests, curl-style tooling).
	 *
	 * Query strings are deliberately NOT accepted: they end up in access logs and
	 * proxy traces, which is the last place an access token should be.
	 */
	extractToken(client: Socket): string | null {
		const fromAuth = client.handshake?.auth?.token;
		if (typeof fromAuth === 'string' && fromAuth.trim()) {
			return this.stripBearer(fromAuth.trim());
		}

		const header = client.handshake?.headers?.authorization;
		if (typeof header === 'string' && header.trim()) {
			return this.stripBearer(header.trim());
		}

		return null;
	}

	/**
	 * Verifies a token and narrows it to a principal.
	 *
	 * Both token types are accepted because both carry a tenant: a coach asking
	 * about their roster and a client asking about their own plan are equally
	 * valid callers, and the tenant scoping is identical either way.
	 */
	async verify(token: string): Promise<WsPrincipal> {
		const secret = this.configService.jwtConfig.accessToken.secret;

		let payload: AuthPayload | ClientAuthPayload;
		try {
			payload = await this.jwt.verifyAsync(token, { secret });
		} catch {
			// Signature, expiry and malformed tokens all land here. The reason is
			// deliberately not echoed back to the caller.
			throw new UnauthorizedException('Invalid or expired token');
		}

		// Refresh tokens are signed with a different secret so they cannot reach
		// this point, but the type check is what stops any other future token
		// shape from being treated as a session.
		if (payload?.type === 'tenant-user') {
			const coach = payload as AuthPayload;
			if (!coach.tenantId || !coach.userId) {
				throw new UnauthorizedException('Token is missing tenant or user');
			}
			return {
				tenantId: coach.tenantId,
				email: coach.email,
				coachId: coach.userId,
				clientId: null,
			};
		}

		if (payload?.type === 'client') {
			const client = payload as ClientAuthPayload;
			if (!client.tenantId || !client.clientId) {
				throw new UnauthorizedException('Token is missing tenant or client');
			}
			return {
				tenantId: client.tenantId,
				email: client.email,
				coachId: null,
				clientId: client.clientId,
			};
		}

		throw new UnauthorizedException('Invalid token type');
	}

	/** Extract + verify in one step, for the handshake. */
	async authenticate(client: Socket): Promise<WsPrincipal> {
		const token = this.extractToken(client);
		if (!token) {
			throw new UnauthorizedException('No access token on the connection');
		}
		return this.verify(token);
	}

	private stripBearer(value: string): string {
		return value.replace(/^Bearer\s+/i, '');
	}
}
