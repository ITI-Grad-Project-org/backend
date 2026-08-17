import { UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';
import { AiGateway } from './ai.gateway';
import { AiService } from './ai.service';
import { WsAuthService, WsPrincipal } from '../auth/services/ws-auth.service';
import { AiSubjectService } from './ai-subject.service';
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
	let subjects: { resolve: jest.Mock };
	let gateway: AiGateway;

	beforeEach(() => {
		aiService = { dispatch: jest.fn().mockResolvedValue('req-1') };
		wsAuth = {
			authenticate: jest.fn(),
			verify: jest.fn(),
			extractToken: jest.fn().mockReturnValue('a-token'),
		};
		subjects = { resolve: jest.fn().mockResolvedValue(null) };
		const configService = {
			aiConfig: { aiRequestTimeoutMs: 30000 },
		} as never;
		gateway = new AiGateway(
			aiService as unknown as AiService,
			configService,
			wsAuth as unknown as WsAuthService,
			subjects as unknown as AiSubjectService,
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

	// ── Who a question may be about ──────────────────────────────────────────
	//
	// The answer can be grounded in the named client's own check-ins, so this is
	// the only security decision on the chat path. Getting it wrong does not
	// produce a bad answer — it reads one client's notes out to another.

	const MEMBERSHIP = '11111111-1111-4111-8111-111111111111';

	async function ask(principal: WsPrincipal, body: Record<string, unknown>) {
		wsAuth.verify.mockResolvedValue(principal);
		const socket = fakeSocket();
		socket.data.token = 'a-token';
		await gateway.onAIRequested(socket, {
			kind: 'advice',
			prompt: 'how is it going?',
			...body,
		});
		return socket;
	}

	describe('question subject', () => {
		it('scopes a coach to the membership they named, once it is confirmed', async () => {
			subjects.resolve.mockResolvedValue({ id: MEMBERSHIP });

			await ask(COACH, { membershipId: MEMBERSHIP });

			expect(subjects.resolve).toHaveBeenCalledWith(COACH, MEMBERSHIP);
			expect(aiService.dispatch).toHaveBeenCalledWith(
				expect.objectContaining({ membershipId: MEMBERSHIP }),
			);
		});

		it('refuses a membership that is not in the coach’s tenant', async () => {
			subjects.resolve.mockResolvedValue(null);

			const socket = await ask(COACH, { membershipId: MEMBERSHIP });

			expect(aiService.dispatch).not.toHaveBeenCalled();
			expect(socket.emit).toHaveBeenCalledWith(EventType.AI_REJECTED, {
				message: 'client not found in this tenant',
			});
		});

		// A client naming someone else is the attack this exists to stop. The
		// resolver ignores the field outright, so the id never reaches retrieval.
		it('ignores a membershipId a client tries to supply', async () => {
			subjects.resolve.mockResolvedValue({ id: 'their-own-membership' });

			await ask(CLIENT, { membershipId: MEMBERSHIP });

			expect(aiService.dispatch).toHaveBeenCalledWith(
				expect.objectContaining({ membershipId: 'their-own-membership' }),
			);
		});

		it('answers without private context when no client is named', async () => {
			subjects.resolve.mockResolvedValue(null);

			await ask(COACH, {});

			expect(aiService.dispatch).toHaveBeenCalledWith(
				expect.objectContaining({ membershipId: null }),
			);
		});

		it('rejects a membershipId that is not a uuid', async () => {
			const socket = await ask(COACH, { membershipId: 'not-a-uuid' });

			expect(aiService.dispatch).not.toHaveBeenCalled();
			expect(socket.emit).toHaveBeenCalledWith(EventType.AI_REJECTED, {
				message: 'membershipId must be a UUID',
			});
		});
	});
});
