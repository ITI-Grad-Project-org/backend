import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Post,
	Query,
	UseGuards,
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
import {
	ClientJwtAuthGuard,
	CurrentClient,
	CurrentTenant,
	Public,
} from '../auth';

/**
 * Client-side chat over HTTP. `@Public()` steps around the global coach guard so
 * the client `ClientJwtAuthGuard` can run instead. The thread is fixed to the
 * client's own id and its token's tenant (the coach it is currently training
 * with) — a client with several coaches switches tenant the same way it does
 * everywhere else in the app.
 */
@Public()
@ApiTags('Chat (client)')
@ApiBearerAuth()
@UseGuards(ClientJwtAuthGuard)
@Controller('client/me/chat')
export class ClientChatController {
	constructor(
		private readonly chatService: ChatService,
		private readonly chatGateway: ChatGateway,
	) {}

	@Get('messages')
	@ApiOperation({ summary: 'Fetch a page of my thread with my coach' })
	@ApiResponse({ status: 200, description: 'Messages retrieved' })
	@ApiResponse({ status: 403, description: 'No active coach relationship' })
	@HttpCode(HttpStatus.OK)
	async listMessages(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string,
		@Query() query: ListMessagesQueryDto,
	) {
		await this.chatService.assertConversation(tenantId, clientId);
		return this.chatService.listMessages(tenantId, clientId, query);
	}

	@Post('messages')
	@ApiOperation({
		summary: 'Message my coach (also delivered over WebSocket)',
	})
	@ApiResponse({ status: 201, description: 'Message sent' })
	@ApiResponse({ status: 403, description: 'No active coach relationship' })
	async send(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string,
		@Body() dto: SendMessageDto,
	) {
		const message = await this.chatService.createMessage({
			tenantId,
			clientId,
			senderType: ChatSender.CLIENT,
			body: dto.body,
		});
		this.chatGateway.broadcastMessage(message, dto.clientMsgId);
		return message;
	}

	@Post('read')
	@ApiOperation({ summary: "Mark my coach's messages as read" })
	@ApiResponse({ status: 200, description: 'Marked read' })
	@HttpCode(HttpStatus.OK)
	async read(
		@CurrentClient('clientId') clientId: string,
		@CurrentTenant() tenantId: string,
	) {
		return this.chatGateway.markConversationRead(
			tenantId,
			clientId,
			ChatSender.CLIENT,
		);
	}
}
