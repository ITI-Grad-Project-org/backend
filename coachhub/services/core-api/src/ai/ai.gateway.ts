import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AiService } from './ai.service';
import { ConfigService } from '../config';
import { allowedOrigins } from '../config/configuration';
import { WsAuthService, WsPrincipal } from '../auth/services/ws-auth.service';
import { AiCompletedPayload, EventType } from '../messaging/events';
import { AiSubjectService } from './ai-subject.service';

/** Longest prompt accepted, in characters. */
const MAX_PROMPT_LENGTH = 4000;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Socket.IO serialises `message` and `data` from a middleware error into the
 * client's `connect_error`, which is the only channel a refused socket has.
 */
function handshakeError(code: string, message: string): Error {
	const error = new Error(message) as Error & { data?: unknown };
	error.data = { code };
	return error;
}

interface AiRequestBody {
	kind?: unknown;
	prompt?: unknown;
	/** Optional: the client a coach is asking about. */
	clientId?: unknown;
	/**
	 * Optional: which client's own material the answer may draw on.
	 *
	 * Honoured only for a coach, and only after the membership is confirmed to be
	 * in their tenant. A client's socket may send this and it is ignored — they
	 * are always scoped to themselves.
	 */
	membershipId?: unknown;
}

@WebSocketGateway({
	cors: {
		origin: allowedOrigins(),
		credentials: true,
	},
})
export class AiGateway
	implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
	@WebSocketServer()
	private server: Server;

	private readonly logger = new Logger(AiGateway.name);
	private readonly timeouts = new Map<string, NodeJS.Timeout>();
	private readonly timeoutMs: number;

	constructor(
		private readonly aiService: AiService,
		private readonly configService: ConfigService,
		private readonly wsAuth: WsAuthService,
		private readonly subjects: AiSubjectService,
	) {
		this.timeoutMs = this.configService.aiConfig.aiRequestTimeoutMs;
	}

	/**
	 * Authenticate during the handshake rather than after it.
	 *
	 * Refusing a socket from `handleConnection` means the client fires `connect`
	 * first and is dropped a moment later, which reads to whoever is integrating
	 * as a flaky network rather than a refused credential — and the
	 * `ai.unauthorized` frame races the teardown, so it can be lost entirely.
	 * A connection middleware is Socket.IO's own mechanism for this: `connect`
	 * never fires, and the reason arrives on `connect_error` where a client can
	 * actually act on it.
	 */
	afterInit(server: Server) {
		server.use((socket, next) => {
			void this.authenticateHandshake(socket, next);
		});
	}

	private async authenticateHandshake(
		client: Socket,
		next: (err?: Error) => void,
	) {
		try {
			const principal = await this.wsAuth.authenticate(client);
			client.data.principal = principal;
			// Kept so every message can re-verify it; see onAIRequested.
			client.data.token = this.wsAuth.extractToken(client);
			next();
		} catch (error) {
			// Sent nothing, or sent something that doesn't verify? Those need
			// different fixes from the caller, and telling them which one it is
			// discloses nothing they don't already know about their own request.
			// Why the token failed — expired, wrong signature, wrong type — stays
			// in the log.
			const sentSomething = Boolean(this.wsAuth.extractToken(client));
			this.logger.warn(`ws rejected: ${client.id} — ${this.messageOf(error)}`);
			next(
				handshakeError(
					sentSomething ? 'INVALID_TOKEN' : 'NO_TOKEN',
					sentSomething
						? 'Access token is invalid or expired.'
						: 'No access token on the connection. Send it as ' +
								'auth: { token } when opening the socket.',
				),
			);
		}
	}

	handleConnection(client: Socket) {
		const principal = client.data?.principal as WsPrincipal | undefined;
		if (!principal) {
			// Unreachable while the middleware is registered. If it ever is
			// reached the middleware did not run, so fail closed rather than serve
			// an unauthenticated socket.
			this.logger.error(`ws reached connect unauthenticated: ${client.id}`);
			client.emit(EventType.AI_UNAUTHORIZED, { message: 'Unauthorized' });
			client.disconnect(true);
			return;
		}
		this.logger.debug(
			`ws connected: ${client.id} (tenant=${principal.tenantId})`,
		);
	}

	handleDisconnect(client: Socket) {
		this.logger.debug(`ws disconnected: ${client.id}`);
	}

	@SubscribeMessage(EventType.AI_REQUESTED)
	async onAIRequested(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: AiRequestBody,
	) {
		const principal = await this.reauthenticate(client);
		if (!principal) {
			return;
		}

		const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
		const kind = typeof body?.kind === 'string' ? body.kind.trim() : '';
		if (!prompt) {
			this.reject(client, 'prompt is required');
			return;
		}
		if (prompt.length > MAX_PROMPT_LENGTH) {
			this.reject(
				client,
				`prompt must be at most ${MAX_PROMPT_LENGTH} characters`,
			);
			return;
		}
		if (!kind) {
			this.reject(client, 'kind is required');
			return;
		}

		// Request metadata, not a security boundary: the answer is only ever emitted
		// back to the socket that asked.
		const subjectClientId = this.readClientId(body, principal);
		if (subjectClientId === undefined) {
			this.reject(client, 'clientId must be a UUID');
			return;
		}

		const requestedMembershipId = this.readMembershipId(body);
		if (requestedMembershipId === undefined) {
			this.reject(client, 'membershipId must be a UUID');
			return;
		}

		// This one IS a security boundary. The answer can be grounded in the named
		// client's own check-ins, so who may name whom is decided against the
		// database, never taken from the message.
		const subject = await this.subjects.resolve(
			principal,
			requestedMembershipId,
		);
		if (requestedMembershipId && principal.coachId && !subject) {
			this.reject(client, 'client not found in this tenant');
			return;
		}

		const requestId = await this.aiService.dispatch({
			tenantId: principal.tenantId,
			clientId: subjectClientId,
			membershipId: subject?.id ?? null,
			coachId: principal.coachId,
			coachEmail: principal.coachId ? principal.email : null,
			kind,
			prompt,
		});

		client.join(this.room(requestId));
		this.armTimeout(requestId);
		client.emit(EventType.AI_ACCEPTED, { requestId });
	}

	pushCompleted(payload: AiCompletedPayload) {
		this.cancelTimeout(payload.requestId);
		this.server
			.to(this.room(payload.requestId))
			.emit(EventType.AI_COMPLETED, payload);
	}

	private async reauthenticate(client: Socket): Promise<WsPrincipal | null> {
		const token = client.data?.token as string | undefined;
		if (!token) {
			this.closeUnauthorized(client, 'connection is not authenticated');
			return null;
		}
		try {
			const principal = await this.wsAuth.verify(token);
			client.data.principal = principal;
			return principal;
		} catch (error) {
			this.closeUnauthorized(client, this.messageOf(error));
			return null;
		}
	}

	private readClientId(
		body: AiRequestBody,
		principal: WsPrincipal,
	): string | null | undefined {
		if (body?.clientId === undefined || body?.clientId === null) {
			// A client asking on their own behalf is the subject of their own
			// request.
			return principal.clientId;
		}
		if (
			typeof body.clientId !== 'string' ||
			!UUID_PATTERN.test(body.clientId)
		) {
			return undefined;
		}
		return body.clientId;
	}

	/**
	 * @returns the requested membership, null when none was asked for, or
	 *   `undefined` when the value is not a uuid.
	 */
	private readMembershipId(body: AiRequestBody): string | null | undefined {
		if (body?.membershipId === undefined || body?.membershipId === null) {
			return null;
		}
		if (
			typeof body.membershipId !== 'string' ||
			!UUID_PATTERN.test(body.membershipId)
		) {
			return undefined;
		}
		return body.membershipId;
	}

	private reject(client: Socket, message: string) {
		client.emit(EventType.AI_REJECTED, { message });
	}

	private closeUnauthorized(client: Socket, reason: string) {
		this.logger.warn(`ws unauthorized: ${client.id} — ${reason}`);
		client.emit(EventType.AI_UNAUTHORIZED, { message: 'Unauthorized' });
		client.disconnect(true);
	}

	private messageOf(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	private armTimeout(requestId: string) {
		const timer = setTimeout(() => {
			this.timeouts.delete(requestId);
			this.logger.warn(
				`ai request ${requestId} timed out after ${this.timeoutMs}ms`,
			);
			this.server
				.to(this.room(requestId))
				.emit(EventType.AI_TIMED_OUT, { requestId });
		}, this.timeoutMs);

		// Advisory only — a pending timeout should never be the reason the process
		// stays alive. The HTTP server keeps the loop open in a real run; in tests
		// this is what stops an armed 30s timer from outliving the suite.
		timer.unref?.();
		this.timeouts.set(requestId, timer);
	}

	private cancelTimeout(requestId: string) {
		const timer = this.timeouts.get(requestId);
		if (timer) {
			clearTimeout(timer);
			this.timeouts.delete(requestId);
		}
	}

	private room(requestId: string): string {
		return `ai:req:${requestId}`;
	}
}
