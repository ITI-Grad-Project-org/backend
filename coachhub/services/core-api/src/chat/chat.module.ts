import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { CoachChatController } from './coach-chat.controller';
import { ClientChatController } from './client-chat.controller';
import { ChatMessage } from './entities/chat-message.entity';
import { ClientModule } from '../clients/client.module';
import { ConfigModule } from '../config';

@Module({
	imports: [
		TypeOrmModule.forFeature([ChatMessage]),
		// ClientModule exports ClientMembershipService — the authorization source.
		ClientModule,
		ConfigModule,
		// Gateway verifies the same access token the HTTP guards use.
		JwtModule.register({}),
	],
	controllers: [CoachChatController, ClientChatController],
	providers: [ChatService, ChatGateway],
	exports: [ChatService],
})
export class ChatModule {}
