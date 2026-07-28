/**
 * Chat — shared frontend types for the CoachHub real-time chat.
 *
 * Drop this into the web/mobile app. It types both the Socket.IO events (so
 * `emit`/`on` are checked at the call site) and the REST payloads. See
 * `chat-frontend.md` for the narrative guide.
 *
 * The only runtime dependency is `socket.io-client` (for the `Socket` generic).
 * If you don't want that import, delete the `ChatSocket` alias at the bottom —
 * everything else is plain types + string constants.
 */
import type { Socket } from 'socket.io-client';

// ─── Core shapes ────────────────────────────────────────────────────────────

export type ChatSenderType = 'coach' | 'client';

/** A membership can only chat while it is confirmed. */
export type ChattableStatus = 'active' | 'paused';

/** One message. Dates are ISO strings over the wire. */
export interface ChatMessage {
	id: string;
	tenantId: string;
	/** Identifies the thread — the client half of the (tenant, client) pair. */
	clientId: string;
	senderType: ChatSenderType;
	body: string;
	/** ISO timestamp, or `null` while unread. */
	readAt: string | null;
	createdAt: string;
}

/**
 * `message:new` carries a `clientMsgId` **only** on the sender's own echo, so an
 * optimistic bubble can be reconciled to its saved copy.
 */
export interface IncomingChatMessage extends ChatMessage {
	clientMsgId?: string;
}

/** A row in the coach's inbox (`GET /chat/conversations`). */
export interface ConversationSummary {
	clientId: string;
	client: {
		id: string;
		firstName: string;
		lastName: string;
		avatarUrl: string | null;
	} | null;
	status: ChattableStatus;
	/** `null` if the thread has no messages yet. */
	lastMessage: ChatMessage | null;
	/** Client messages the coach hasn't read. */
	unreadCount: number;
}

// ─── Acknowledgements ───────────────────────────────────────────────────────

/** Every emit resolves to this — never a thrown error. */
export type ChatAck<T = void> =
	| { ok: true; data?: T }
	| { ok: false; error: string };

// ─── Emit payloads (client → server) ────────────────────────────────────────
//
// `clientId` rule: a **client omits it** (locked to itself); a **coach must
// supply it** (the client it is talking to).

export interface JoinConversationPayload {
	/** Coach only — clients are auto-joined to their thread on connect. */
	clientId: string;
}

export interface LeaveConversationPayload {
	clientId: string;
}

export interface SendMessagePayload {
	/** Required for a coach; omitted by a client. */
	clientId?: string;
	/** 1–4000 chars; trimmed server-side. */
	body: string;
	/** Your temp id, echoed back on `message:new` for reconciliation. */
	clientMsgId?: string;
}

export interface TypingPayload {
	clientId?: string;
	isTyping: boolean;
}

export interface MarkReadPayload {
	clientId?: string;
}

export interface MarkReadResult {
	/** Number of the other party's messages just marked read. */
	count: number;
}

// ─── Broadcast payloads (server → client) ───────────────────────────────────

export interface ConversationUpdatedEvent {
	clientId: string;
	lastMessage: ChatMessage;
}

export interface TypingEvent {
	clientId: string;
	from: ChatSenderType;
	isTyping: boolean;
}

export interface MessagesReadEvent {
	clientId: string;
	reader: ChatSenderType;
	/** ISO timestamp the messages were read at. */
	readAt: string;
	count: number;
}

export interface ChatErrorEvent {
	message: string;
}

// ─── Event names ────────────────────────────────────────────────────────────

/** Events the frontend emits. */
export const ChatClientEvent = {
	Join: 'conversation:join',
	Leave: 'conversation:leave',
	Send: 'message:send',
	Typing: 'typing',
	Read: 'messages:read',
} as const;
export type ChatClientEvent =
	(typeof ChatClientEvent)[keyof typeof ChatClientEvent];

/** Events the frontend listens for. */
export const ChatServerEvent = {
	Message: 'message:new',
	ConversationUpdated: 'conversation:updated',
	Typing: 'typing',
	MessagesRead: 'messages:read',
	Error: 'error',
} as const;
export type ChatServerEvent =
	(typeof ChatServerEvent)[keyof typeof ChatServerEvent];

// ─── Typed Socket.IO maps ───────────────────────────────────────────────────

/** Pass to `Socket<ChatServerToClientEvents, ChatClientToServerEvents>`. */
export interface ChatServerToClientEvents {
	'message:new': (msg: IncomingChatMessage) => void;
	'conversation:updated': (evt: ConversationUpdatedEvent) => void;
	typing: (evt: TypingEvent) => void;
	'messages:read': (evt: MessagesReadEvent) => void;
	error: (evt: ChatErrorEvent) => void;
}

export interface ChatClientToServerEvents {
	'conversation:join': (
		payload: JoinConversationPayload,
		ack?: (res: ChatAck) => void,
	) => void;
	'conversation:leave': (
		payload: LeaveConversationPayload,
		ack?: (res: ChatAck) => void,
	) => void;
	'message:send': (
		payload: SendMessagePayload,
		ack?: (res: ChatAck<ChatMessage>) => void,
	) => void;
	typing: (payload: TypingPayload, ack?: (res: ChatAck) => void) => void;
	'messages:read': (
		payload: MarkReadPayload,
		ack?: (res: ChatAck<MarkReadResult>) => void,
	) => void;
}

/**
 * Fully typed chat socket. Usage:
 *
 * ```ts
 * import { io } from 'socket.io-client';
 * const socket: ChatSocket = io(`${API}/chat`, { auth: { token } });
 * socket.emit('message:send', { clientId, body }, (ack) => { ... }); // checked
 * ```
 */
export type ChatSocket = Socket<
	ChatServerToClientEvents,
	ChatClientToServerEvents
>;

// ─── REST payloads ──────────────────────────────────────────────────────────

/** Body for `POST .../messages` (coach and client). */
export interface SendMessageBody {
	body: string;
	clientMsgId?: string;
}

/** Query for the history `GET` endpoints. */
export interface ListMessagesQuery {
	/** Return messages older than this ISO timestamp (for "load earlier"). */
	before?: string;
	/** Default 30, max 100. */
	limit?: number;
}

/** REST endpoint paths, so callers don't hardcode strings. */
export const ChatRestPaths = {
	coach: {
		conversations: '/chat/conversations',
		messages: (clientId: string) => `/chat/conversations/${clientId}/messages`,
		read: (clientId: string) => `/chat/conversations/${clientId}/read`,
	},
	client: {
		messages: '/client/me/chat/messages',
		read: '/client/me/chat/read',
	},
} as const;
