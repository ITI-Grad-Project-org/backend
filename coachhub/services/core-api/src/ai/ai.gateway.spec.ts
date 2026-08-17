import { UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';
import { AiGateway } from './ai.gateway';
import { AiService } from './ai.service';
import { WsAuthService, WsPrincipal } from '../auth/services/ws-auth.service';
import { EventType } from '../messaging/events';

const COACH: WsPrincipal = {
	tenantId: 'tenant-a',
	email: 'coach@example.com',
	coachId: 'coach-1',
	clientId: null,
};

const CLIENT: WsPrincipal = {
	tenantId: 'tenant-b',
	email: 'client@example.com',
	coachId: null,
	clientId: 'client-1',
};

function fakeSocket(): jest.Mocked<Socket> & { data: Record<string, unknown> } {
	return {
		id: 'socket-1',
		data: {},
		emit: jest.fn(),
		join: jest.fn(),
		disconnect: jest.fn(),
		handshake: { auth: {}, headers: {} },
	} as unknown as jest.Mocked<Socket> & { data: Record<string, unknown> };
}

describe('AiGateway', () => {
	let aiService: { dispatch: jest.Mock };
	let wsAuth: {
		authenticate: jest.Mock;
		verify: jest.Mock;
		extractToken: jest.Mock;
	};
	let gateway: AiGateway;

	beforeEach(() => {
		aiService = { dispatch: jest.fn().mockResolvedValue('req-1') };
		wsAuth = {
			authenticate: jest.fn(),
			verify: jest.fn(),
			extractToken: jest.fn().mockReturnValue('a-token'),
		};
		const configService = {
			aiConfig: { aiRequestTimeoutMs: 30000 },
		} as never;
		gateway = new AiGateway(
			aiService as unknown as AiService,
			configService,
			wsAuth as unknown as WsAuthService,
		);
	});

	describe('handleConnection', () => {
		it('stores the principal on an authenticated socket', async () => {
			wsAuth.authenticate.mockResolvedValue(COACH);
			const socket = fakeSocket();

			await gateway.handleConnection(socket);

			expect(socket.data.principal).toEqual(COACH);
			expect(socket.disconnect).not.toHaveBeenCalled();
		});

		it('closes a socket that cannot authenticate', async () => {
			wsAuth.authenticate.mockRejectedValue(new UnauthorizedException('nope'));
			const socket = fakeSocket();

			await gateway.handleConnection(socket);

			expect(socket.emit).toHaveBeenCalledWith(
				EventType.AI_UNAUTHORIZED,
				expect.anything(),
			);
			expect(socket.disconnect).toHaveBeenCalledWith(true);
		});
	});

	describe('onAIRequested', () => {
		function connected(principal: WsPrincipal) {
			const socket = fakeSocket();
			socket.data.principal = principal;
			socket.data.token = 'a-token';
			wsAuth.verify.mockResolvedValue(principal);
			return socket;
		}

		it('dispatches with the tenant from the token, never a placeholder', async () => {
			const socket = connected(COACH);

			await gateway.onAIRequested(socket, {
				kind: 'advice',
				prompt: 'How much protein?',
			});

			expect(aiService.dispatch).toHaveBeenCalledWith(
				expect.objectContaining({
					tenantId: 'tenant-a',
					coachId: 'coach-1',
					coachEmail: 'coach@example.com',
					prompt: 'How much protein?',
				}),
			);
			// The bug this replaces: a hardcoded all-zeroes tenant.
			const arg = aiService.dispatch.mock.calls[0][0];
			expect(arg.tenantId).not.toMatch(/^0{8}-/);
		});

		it('attributes a client request to that client', async () => {
			const socket = connected(CLIENT);

			await gateway.onAIRequested(socket, { kind: 'advice', prompt: 'hi' });

			expect(aiService.dispatch).toHaveBeenCalledWith(
				expect.objectContaining({
					tenantId: 'tenant-b',
					clientId: 'client-1',
					coachId: null,
					coachEmail: null,
				}),
			);
		});

		it('re-verifies the token on every message', async () => {
			const socket = connected(COACH);

			await gateway.onAIRequested(socket, { kind: 'advice', prompt: 'hi' });

			// Without this an expired token keeps working for the life of the socket.
			expect(wsAuth.verify).toHaveBeenCalledWith('a-token');
		});

		it('closes the socket when the token has expired mid-connection', async () => {
			const socket = connected(COACH);
			wsAuth.verify.mockRejectedValue(new UnauthorizedException('expired'));

			await gateway.onAIRequested(socket, { kind: 'advice', prompt: 'hi' });

			expect(aiService.dispatch).not.toHaveBeenCalled();
			expect(socket.disconnect).toHaveBeenCalledWith(true);
		});

		it('rejects an empty prompt without dispatching or closing', async () => {
			const socket = connected(COACH);

			await gateway.onAIRequested(socket, { kind: 'advice', prompt: '   ' });

			expect(aiService.dispatch).not.toHaveBeenCalled();
			expect(socket.emit).toHaveBeenCalledWith(
				EventType.AI_REJECTED,
				expect.anything(),
			);
			expect(socket.disconnect).not.toHaveBeenCalled();
		});

		it('rejects an over-long prompt', async () => {
			const socket = connected(COACH);

			await gateway.onAIRequested(socket, {
				kind: 'advice',
				prompt: 'x'.repeat(4001),
			});

			expect(aiService.dispatch).not.toHaveBeenCalled();
			expect(socket.emit).toHaveBeenCalledWith(
				EventType.AI_REJECTED,
				expect.anything(),
			);
		});

		it('rejects a non-UUID clientId', async () => {
			const socket = connected(COACH);

			await gateway.onAIRequested(socket, {
				kind: 'advice',
				prompt: 'hi',
				clientId: 'not-a-uuid',
			});

			expect(aiService.dispatch).not.toHaveBeenCalled();
			expect(socket.emit).toHaveBeenCalledWith(
				EventType.AI_REJECTED,
				expect.anything(),
			);
		});

		it('joins the reply room and acknowledges', async () => {
			const socket = connected(COACH);

			await gateway.onAIRequested(socket, { kind: 'advice', prompt: 'hi' });

			expect(socket.join).toHaveBeenCalledWith('ai:req:req-1');
			expect(socket.emit).toHaveBeenCalledWith(EventType.AI_ACCEPTED, {
				requestId: 'req-1',
			});
		});
	});
});
