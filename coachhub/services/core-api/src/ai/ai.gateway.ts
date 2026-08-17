import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
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

/** Longest prompt accepted, in characters. */
const MAX_PROMPT_LENGTH = 4000;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AiRequestBody {
	kind?: unknown;
	prompt?: unknown;
	/** Optional: the client a coach is asking about. */
	clientId?: unknown;
}

@WebSocketGateway({
	cors: {
		origin: allowedOrigins(),
		credentials: true,
	},
})
export class AiGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	private server: Server;

	private readonly logger = new Logger(AiGateway.name);
	private readonly timeouts = new Map<string, NodeJS.Timeout>();
	private readonly timeoutMs: number;

	constructor(
		private readonly aiService: AiService,
		private readonly configService: ConfigService,
		private readonly wsAuth: WsAuthService,
	) {
		this.timeoutMs = this.configService.aiConfig.aiRequestTimeoutMs;
	}

	async handleConnection(client: Socket) {
		try {
			const principal = await this.wsAuth.authenticate(client);
			client.data.principal = principal;
			// Kept so every message can re-verify it; see onAIRequested.
			client.data.token = this.wsAuth.extractToken(client);
			this.logger.debug(
				`ws connected: ${client.id} (tenant=${principal.tenantId})`,
			);
		} catch (error) {
			this.logger.warn(`ws rejected: ${client.id} — ${this.messageOf(error)}`);
			client.emit(EventType.AI_UNAUTHORIZED, { message: 'Unauthorized' });
			client.disconnect(true);
		}
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

		// Request metadata, not a security boundary: retrieval is scoped by tenant
		// alone, and the answer is only ever emitted back to the socket that asked.
		const subjectClientId = this.readClientId(body, principal);
		if (subjectClientId === undefined) {
			this.reject(client, 'clientId must be a UUID');
			return;
		}

		const requestId = await this.aiService.dispatch({
			tenantId: principal.tenantId,
			clientId: subjectClientId,
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
