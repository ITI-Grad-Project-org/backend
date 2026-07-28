import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatSender } from './enums/chat-sender.enum';
import { SendMessageDto } from './dto/send-message.dto';
import { ListMessagesQueryDto } from './dto/list-messages.dto';
import { CurrentTenant } from '../auth';

/**
 * Coach-side chat over HTTP. Covered by the global coach `JwtAuthGuard`, so the
 * tenant is taken from the token and a coach only ever sees its own threads.
 * Sends here fan out over WebSocket too, so a coach on the web and its clients
 * on mobile stay in sync regardless of which transport wrote the message.
 */
@ApiTags('Chat (coach)')
@ApiBearerAuth()
@Controller('chat')
export class CoachChatController {
	constructor(
		private readonly chatService: ChatService,
		private readonly chatGateway: ChatGateway,
	) {}

	@Get('conversations')
	@ApiOperation({
		summary: 'List my client threads with last message and unread count',
	})
	@ApiResponse({ status: 200, description: 'Conversations retrieved' })
	@HttpCode(HttpStatus.OK)
	listConversations(@CurrentTenant() tenantId: string) {
		return this.chatService.listCoachConversations(tenantId);
	}

	@Get('conversations/:clientId/messages')
	@ApiOperation({ summary: 'Fetch a page of the thread with one client' })
	@ApiResponse({ status: 200, description: 'Messages retrieved' })
	@ApiResponse({
		status: 403,
		description: 'No active relationship with client',
	})
	@HttpCode(HttpStatus.OK)
	async listMessages(
		@CurrentTenant() tenantId: string,
		@Param('clientId', ParseUUIDPipe) clientId: string,
		@Query() query: ListMessagesQueryDto,
	) {
		await this.chatService.assertConversation(tenantId, clientId);
		return this.chatService.listMessages(tenantId, clientId, query);
	}

	@Post('conversations/:clientId/messages')
	@ApiOperation({
		summary: 'Send a message to a client (also delivered over WebSocket)',
	})
	@ApiResponse({ status: 201, description: 'Message sent' })
	@ApiResponse({
		status: 403,
		description: 'No active relationship with client',
	})
	async send(
		@CurrentTenant() tenantId: string,
		@Param('clientId', ParseUUIDPipe) clientId: string,
		@Body() dto: SendMessageDto,
	) {
		const message = await this.chatService.createMessage({
			tenantId,
			clientId,
			senderType: ChatSender.COACH,
			body: dto.body,
		});
		this.chatGateway.broadcastMessage(message, dto.clientMsgId);
		return message;
	}

	@Post('conversations/:clientId/read')
	@ApiOperation({ summary: "Mark this client's messages as read" })
	@ApiResponse({ status: 200, description: 'Marked read' })
	@HttpCode(HttpStatus.OK)
	async read(
		@CurrentTenant() tenantId: string,
		@Param('clientId', ParseUUIDPipe) clientId: string,
	) {
		return this.chatGateway.markConversationRead(
			tenantId,
			clientId,
			ChatSender.COACH,
		);
	}
}
