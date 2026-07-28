import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatSender } from './enums/chat-sender.enum';
import { ClientMembershipService } from '../clients/client-membership.service';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { MembershipStatus } from '../common';

const DEFAULT_PAGE = 30;
const MAX_PAGE = 100;

export interface ConversationSummary {
	clientId: string;
	client: {
		id: string;
		firstName: string;
		lastName: string;
		avatarUrl: string | null;
	} | null;
	status: MembershipStatus;
	lastMessage: ChatMessage | null;
	unreadCount: number;
}

interface RawMessageRow {
	id: string;
	tenant_id: string;
	client_id: string;
	sender_type: ChatSender;
	body: string;
	read_at: Date | null;
	created_at: Date;
}

@Injectable()
export class ChatService {
	// A thread is open only while there is a live coaching relationship. Invited,
	// requested, rejected, archived and blocked all lack one, so they can't chat.
	private static readonly CHATTABLE: MembershipStatus[] = [
		MembershipStatus.ACTIVE,
		MembershipStatus.PAUSED,
	];

	constructor(
		@InjectRepository(ChatMessage)
		private readonly repo: Repository<ChatMessage>,
		private readonly membershipService: ClientMembershipService,
	) {}

	/**
	 * The single authorization gate — every HTTP and WS entry point runs it.
	 * `tenantId` is always taken from the caller's token, so this only has to
	 * prove the client is (still) a live member of that tenant.
	 */
	async assertConversation(
		tenantId: string,
		clientId: string,
	): Promise<ClientMembership> {
		const membership = await this.membershipService.findTenantMember(
			tenantId,
			clientId,
		);
		if (!membership || !ChatService.CHATTABLE.includes(membership.status)) {
			throw new ForbiddenException(
				'No active coaching relationship for this conversation',
			);
		}
		return membership;
	}

	async createMessage(params: {
		tenantId: string;
		clientId: string;
		senderType: ChatSender;
		body: string;
	}): Promise<ChatMessage> {
		await this.assertConversation(params.tenantId, params.clientId);
		const message = this.repo.create({
			tenantId: params.tenantId,
			clientId: params.clientId,
			senderType: params.senderType,
			body: params.body,
		});
		return this.repo.save(message);
	}

	/** One page of a thread, returned oldest → newest for direct rendering. */
	async listMessages(
		tenantId: string,
		clientId: string,
		opts: { before?: string; limit?: number } = {},
	): Promise<ChatMessage[]> {
		const limit = Math.min(opts.limit ?? DEFAULT_PAGE, MAX_PAGE);
		const qb = this.repo
			.createQueryBuilder('m')
			.where('m.tenantId = :tenantId', { tenantId })
			.andWhere('m.clientId = :clientId', { clientId })
			.orderBy('m.createdAt', 'DESC')
			.addOrderBy('m.id', 'DESC')
			.take(limit);
		if (opts.before) {
			qb.andWhere('m.createdAt < :before', { before: new Date(opts.before) });
		}
		const rows = await qb.getMany();
		// The query pulls the newest page; callers render oldest → newest.
		return rows.reverse();
	}

	/**
	 * Marks every message the *other* party sent as read. Returns the count and
	 * the timestamp so the gateway can tell that party their bubbles were seen.
	 */
	async markRead(
		tenantId: string,
		clientId: string,
		reader: ChatSender,
	): Promise<{ affected: number; readAt: Date }> {
		const other =
			reader === ChatSender.COACH ? ChatSender.CLIENT : ChatSender.COACH;
		const readAt = new Date();
		const res = await this.repo
			.createQueryBuilder()
			.update(ChatMessage)
			.set({ readAt })
			.where('tenant_id = :tenantId', { tenantId })
			.andWhere('client_id = :clientId', { clientId })
			.andWhere('sender_type = :other', { other })
			.andWhere('read_at IS NULL')
			.execute();
		return { affected: res.affected ?? 0, readAt };
	}

	/**
	 * The coach's inbox: every live client, each with the last message and the
	 * number of their messages the coach hasn't opened yet. Two set-based queries
	 * (last-per-client via DISTINCT ON, unread counts) instead of N per client.
	 */
	async listCoachConversations(
		tenantId: string,
	): Promise<ConversationSummary[]> {
		const memberships =
			await this.membershipService.findTenantMembers(tenantId);
		const chattable = memberships.filter(
			(m) => m.client && ChatService.CHATTABLE.includes(m.status),
		);
		if (chattable.length === 0) {
			return [];
		}

		const lastRows: RawMessageRow[] = await this.repo.query(
			`SELECT DISTINCT ON (client_id)
			        id, tenant_id, client_id, sender_type, body, read_at, created_at
			   FROM chat_messages
			  WHERE tenant_id = $1
			  ORDER BY client_id, created_at DESC`,
			[tenantId],
		);
		const unreadRows: Array<{ client_id: string; count: string }> =
			await this.repo.query(
				`SELECT client_id, COUNT(*)::int AS count
			     FROM chat_messages
			    WHERE tenant_id = $1
			      AND sender_type = '${ChatSender.CLIENT}'
			      AND read_at IS NULL
			    GROUP BY client_id`,
				[tenantId],
			);

		const lastByClient = new Map(lastRows.map((r) => [r.client_id, r]));
		const unreadByClient = new Map(
			unreadRows.map((r) => [r.client_id, Number(r.count)]),
		);

		const summaries: ConversationSummary[] = chattable.map((m) => {
			const client = m.client!;
			const last = lastByClient.get(client.id);
			return {
				clientId: client.id,
				client: {
					id: client.id,
					firstName: client.firstName,
					lastName: client.lastName,
					avatarUrl: client.avatarUrl,
				},
				status: m.status,
				lastMessage: last ? this.rowToMessage(last) : null,
				unreadCount: unreadByClient.get(client.id) ?? 0,
			};
		});

		// Most recently active threads first; empty threads sink to the bottom.
		summaries.sort((a, b) => {
			const at = a.lastMessage?.createdAt?.getTime() ?? 0;
			const bt = b.lastMessage?.createdAt?.getTime() ?? 0;
			return bt - at;
		});
		return summaries;
	}

	private rowToMessage(row: RawMessageRow): ChatMessage {
		const message = new ChatMessage();
		message.id = row.id;
		message.tenantId = row.tenant_id;
		message.clientId = row.client_id;
		message.senderType = row.sender_type;
		message.body = row.body;
		message.readAt = row.read_at;
		message.createdAt = row.created_at;
		return message;
	}
}
