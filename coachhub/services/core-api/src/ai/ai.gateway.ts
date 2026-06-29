import {
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer
}                                        from '@nestjs/websockets';
import { Logger }                        from '@nestjs/common';
import { Server, Socket }                from 'socket.io';
import { AiService }                     from './ai.service';
import { ConfigService }                 from '../config';
import { AiCompletedPayload, EventType } from '../messaging/events';

@WebSocketGateway(
	{
		cors: {
			origin: '*',
		},
	}
)
export class AiGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer()
	private server: Server;

	private readonly logger = new Logger( AiGateway.name );
	private readonly timeouts = new Map<string, NodeJS.Timeout>();
	private readonly timeoutMs: number;

	constructor (
		private readonly aiService: AiService,
		private readonly configService: ConfigService
	) {
		this.timeoutMs = this.configService.aiConfig.aiRequestTimeoutMs;
	}

	handleConnection ( client: Socket ) {
		this.logger.debug( `ws connected: ${client.id}` );
	}

	handleDisconnect ( client: Socket ) {
		this.logger.debug( `ws disconnected: ${client.id}` );
	}

	@SubscribeMessage( EventType.AI_REQUESTED )
	async onAIRequested ( @ConnectedSocket() client: Socket, @MessageBody() body: {
		                      kind: string;
		                      prompt: string
	                      },
	) {
		const requestId = await this.aiService.dispatch( {
			tenantId: '00000000-0000-0000-0000-000000000000',
			clientId: '22222222-2222-2222-2222-222222222222',
			coachId: '11111111-1111-1111-1111-111111111111',
			coachEmail: 'coach@example.com',
			kind: body.kind,
			prompt: body.prompt,
		} );

		client.join( this.room( requestId ) );
		this.armTimeout( requestId );
		client.emit( EventType.AI_ACCEPTED, { requestId } );
	}

	pushCompleted ( payload: AiCompletedPayload ) {
		// this.logger.debug(
		// 	`pushCompleted: requestId=${payload.requestId},
		// result=${payload.summary}`, );
		this.cancelTimeout( payload.requestId );
		this.server.to( this.room( payload.requestId ) ).emit(
			EventType.AI_COMPLETED,
			payload );
	}

	private armTimeout ( requestId: string ) {
		const timer = setTimeout( () => {
			this.timeouts.delete( requestId );
			this.logger.warn(
				`ai request ${requestId} timed out after ${this.timeoutMs}ms`,
			);
			this.server.to( this.room( requestId ) ).emit( EventType.AI_TIMED_OUT,
				{ requestId } );
		}, this.timeoutMs );

		this.timeouts.set( requestId, timer );
	}

	private cancelTimeout ( requestId: string ) {
		const timer = this.timeouts.get( requestId );
		if ( timer ) {
			clearTimeout( timer );
			this.timeouts.delete( requestId );
		}
	}

	private room ( requestId: string ): string {
		return `ai:req:${requestId}`;
	}
}