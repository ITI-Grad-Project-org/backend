import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '../config';
import { allowedOrigins } from '../config/configuration';
import { ChatService } from './chat.service';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatSender } from './enums/chat-sender.enum';

type Identity =
	| { role: ChatSender.COACH; coachId: string; tenantId: string }
	| { role: ChatSender.CLIENT; clientId: string; tenantId: string | null };

type Ack<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Real-time coach ↔ client chat over Socket.IO (namespace `/chat`).
 *
 * Auth mirrors the HTTP guards: the same access token (coach `tenant-user` or
 * `client`) is verified on connect and its identity pinned to the socket, so a
 * client can only ever act on its own thread and a coach only on threads inside
 * its own tenant. A conversation is the `chat:<tenantId>:<clientId>` room; the
 * coach also sits in `coach:<tenantId>` so its inbox badge updates for threads
 * it hasn't opened. Persistence + authorization live in ChatService — this
 * class only moves envelopes and enforces the token identity.
 */
@WebSocketGateway({
	namespace: '/chat',
	cors: { origin: allowedOrigins(), credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer() private readonly server: Server;
	private readonly logger = new Logger(ChatGateway.name);

	constructor(
		private readonly jwtService: JwtService,
		private readonly configService: ConfigService,
		private readonly chatService: ChatService,
	) {}

	private convRoom(tenantId: string, clientId: string): string {
		return `chat:${tenantId}:${clientId}`;
	}

	private coachRoom(tenantId: string): string {
		return `coach:${tenantId}`;
	}

	async handleConnection(client: Socket): Promise<void> {
		try {
			const token = this.extractToken(client);
			if (!token) {
				throw new Error('missing token');
			}
			const payload = await this.jwtService.verifyAsync<Record<string, any>>(
				token,
				{ secret: this.configService.jwtConfig.accessToken.secret },
			);
			const identity = this.toIdentity(payload);
			if (!identity) {
				throw new Error('invalid token type');
			}
			client.data.identity = identity;

			if (identity.role === ChatSender.CLIENT) {
				if (!identity.tenantId) {
					throw new Error('client is not attached to a coach');
				}
				// Prove the relationship up front and drop the socket straight into
				// its one and only thread.
				await this.chatService.assertConversation(
					identity.tenantId,
					identity.clientId,
				);
				await client.join(this.convRoom(identity.tenantId, identity.clientId));
			} else {
				await client.join(this.coachRoom(identity.tenantId));
			}

			this.logger.debug(`socket ${client.id} connected as ${identity.role}`);
		} catch (err) {
			this.logger.warn(
				`socket ${client.id} rejected: ${(err as Error).message}`,
			);
			client.emit('error', { message: 'Unauthorized' });
			client.disconnect(true);
		}
	}

	handleDisconnect(client: Socket): void {
		this.logger.debug(`socket ${client.id} disconnected`);
	}

	/** Coach opens a thread it wants live updates for. Clients are already in theirs. */
	@SubscribeMessage('conversation:join')
	async onJoin(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: { clientId?: string },
	): Promise<Ack> {
		return this.guard(async (identity) => {
			const { tenantId, clientId } = this.resolveTarget(
				identity,
				body?.clientId,
			);
			await this.chatService.assertConversation(tenantId, clientId);
			await client.join(this.convRoom(tenantId, clientId));
			return { ok: true };
		}, client);
	}

	@SubscribeMessage('conversation:leave')
	async onLeave(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: { clientId?: string },
	): Promise<Ack> {
		return this.guard(async (identity) => {
			const { tenantId, clientId } = this.resolveTarget(
				identity,
				body?.clientId,
			);
			await client.leave(this.convRoom(tenantId, clientId));
			return { ok: true };
		}, client);
	}

	@SubscribeMessage('message:send')
	async onMessage(
		@ConnectedSocket() client: Socket,
		@MessageBody()
		body: { clientId?: string; body?: string; clientMsgId?: string },
	): Promise<Ack<ReturnType<ChatGateway['toWire']>>> {
		return this.guard(async (identity) => {
			const { tenantId, clientId } = this.resolveTarget(
				identity,
				body?.clientId,
			);
			const text = (body?.body ?? '').trim();
			if (!text) {
				return { ok: false, error: 'Message body is required' };
			}
			if (text.length > 4000) {
				return { ok: false, error: 'Message is too long (max 4000 chars)' };
			}
			const message = await this.chatService.createMessage({
				tenantId,
				clientId,
				senderType: identity.role,
				body: text,
			});
			// A coach's first message opens the thread it may not have joined yet.
			if (identity.role === ChatSender.COACH) {
				await client.join(this.convRoom(tenantId, clientId));
			}
			this.broadcastMessage(message, body?.clientMsgId);
			return { ok: true, data: this.toWire(message) };
		}, client);
	}

	@SubscribeMessage('typing')
	async onTyping(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: { clientId?: string; isTyping?: boolean },
	): Promise<Ack> {
		return this.guard(async (identity) => {
			const { tenantId, clientId } = this.resolveTarget(
				identity,
				body?.clientId,
			);
			// Ephemeral presence — no DB round-trip, scoped to the thread room and
			// never echoed to the typer.
			client.to(this.convRoom(tenantId, clientId)).emit('typing', {
				clientId,
				from: identity.role,
				isTyping: !!body?.isTyping,
			});
			return { ok: true };
		}, client);
	}

	@SubscribeMessage('messages:read')
	async onRead(
		@ConnectedSocket() client: Socket,
		@MessageBody() body: { clientId?: string },
	): Promise<Ack<{ count: number }>> {
		return this.guard(async (identity) => {
			const { tenantId, clientId } = this.resolveTarget(
				identity,
				body?.clientId,
			);
			const result = await this.markConversationRead(
				tenantId,
				clientId,
				identity.role,
			);
			return { ok: true, data: result };
		}, client);
	}

	// ── Shared with the REST controllers ────────────────────────────────────

	/** Fan a persisted message out to the thread and the coach's inbox. */
	broadcastMessage(message: ChatMessage, clientMsgId?: string): void {
		const wire = this.toWire(message);
		this.server
			.to(this.convRoom(message.tenantId, message.clientId))
			.emit('message:new', { ...wire, clientMsgId });
		this.server
			.to(this.coachRoom(message.tenantId))
			.emit('conversation:updated', {
				clientId: message.clientId,
				lastMessage: wire,
			});
	}

	/** Persist the read + notify the room so the sender's ticks flip. */
	async markConversationRead(
		tenantId: string,
		clientId: string,
		reader: ChatSender,
	): Promise<{ count: number }> {
		await this.chatService.assertConversation(tenantId, clientId);
		const { affected, readAt } = await this.chatService.markRead(
			tenantId,
			clientId,
			reader,
		);
		if (affected > 0) {
			this.server
				.to(this.convRoom(tenantId, clientId))
				.emit('messages:read', { clientId, reader, readAt, count: affected });
		}
		return { count: affected };
	}

	// ── Internals ───────────────────────────────────────────────────────────

	/**
	 * Runs a handler with the socket's pinned identity, turning any thrown error
	 * (e.g. ForbiddenException from assertConversation) into a clean negative ack
	 * so the client's callback always resolves instead of hitting the WS error
	 * channel.
	 */
	private async guard<T>(
		fn: (identity: Identity) => Promise<Ack<T>>,
		client: Socket,
	): Promise<Ack<T>> {
		const identity = client.data.identity as Identity | undefined;
		if (!identity) {
			return { ok: false, error: 'Unauthorized' };
		}
		try {
			return await fn(identity);
		} catch (err) {
			return { ok: false, error: (err as Error).message ?? 'Request failed' };
		}
	}

	/**
	 * Resolves which thread a socket may act on. Clients are locked to their own
	 * `(tenantId, clientId)`; a coach acts inside its own tenant on the client it
	 * names — it can never reach another tenant, since `tenantId` is its token's.
	 */
	private resolveTarget(
		identity: Identity,
		clientIdArg?: string,
	): { tenantId: string; clientId: string } {
		if (identity.role === ChatSender.CLIENT) {
			if (!identity.tenantId) {
				throw new Error('client is not attached to a coach');
			}
			return { tenantId: identity.tenantId, clientId: identity.clientId };
		}
		if (!clientIdArg) {
			throw new Error('clientId is required');
		}
		return { tenantId: identity.tenantId, clientId: clientIdArg };
	}

	private extractToken(client: Socket): string | null {
		const fromAuth = client.handshake.auth?.token;
		const fromHeader = client.handshake.headers?.authorization;
		const fromQuery = client.handshake.query?.token;
		const raw =
			fromAuth ??
			fromHeader ??
			(typeof fromQuery === 'string' ? fromQuery : undefined);
		if (!raw) {
			return null;
		}
		return String(raw).replace(/^Bearer\s+/i, '');
	}

	private toIdentity(payload: Record<string, any>): Identity | null {
		if (payload?.type === 'tenant-user') {
			return {
				role: ChatSender.COACH,
				coachId: payload.userId,
				tenantId: payload.tenantId,
			};
		}
		if (payload?.type === 'client') {
			return {
				role: ChatSender.CLIENT,
				clientId: payload.clientId,
				tenantId: payload.tenantId ?? null,
			};
		}
		return null;
	}

	private toWire(message: ChatMessage) {
		return {
			id: message.id,
			tenantId: message.tenantId,
			clientId: message.clientId,
			senderType: message.senderType,
			body: message.body,
			readAt: message.readAt,
			createdAt: message.createdAt,
		};
	}
}
