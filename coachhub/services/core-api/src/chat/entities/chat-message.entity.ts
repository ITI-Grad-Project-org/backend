import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatSender } from '../enums/chat-sender.enum';

/**
 * One line in a coach ↔ client thread. A conversation is the `(tenant, client)`
 * pair — the coach owns the tenant, the client belongs to it through a live
 * membership — so messages key on those two ids directly rather than a separate
 * conversation row. `tenant_id`/`client_id` stay valid even though the membership
 * row can be soft-deleted and revived, so no FK relation is declared here.
 */
@Entity('chat_messages')
// History pagination walks a single thread newest-first.
@Index(['tenantId', 'clientId', 'createdAt'])
export class ChatMessage {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'tenant_id', type: 'uuid' })
	tenantId: string;

	@Column({ name: 'client_id', type: 'uuid' })
	clientId: string;

	/** Who wrote it — the coach who owns the tenant, or the client. */
	@Column({
		name: 'sender_type',
		type: 'enum',
		enum: ChatSender,
		enumName: 'chat_sender',
	})
	senderType: ChatSender;

	@Column({ type: 'text' })
	body: string;

	/** When the other party first loaded it. Null = still unread. */
	@Column({ name: 'read_at', type: 'timestamptz', nullable: true })
	readAt: Date | null;

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date;
}
