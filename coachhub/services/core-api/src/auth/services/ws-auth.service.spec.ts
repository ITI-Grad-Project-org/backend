import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WsAuthService } from './ws-auth.service';

const SECRET = 'test-secret-for-ws-auth';

const configService = {
	jwtConfig: { accessToken: { secret: SECRET, expiresIn: '15m' } },
} as never;

/** Just enough of a Socket for the handshake paths under test. */
function socketWith(handshake: Record<string, unknown>): Socket {
	return { handshake } as unknown as Socket;
}

describe('WsAuthService', () => {
	const jwt = new JwtService({});
	const service = new WsAuthService(jwt, configService);

	const coachToken = jwt.sign(
		{
			userId: 'coach-1',
			email: 'coach@example.com',
			tenantId: 'tenant-a',
			type: 'tenant-user',
		},
		{ secret: SECRET },
	);

	const clientToken = jwt.sign(
		{
			clientId: 'client-1',
			email: 'client@example.com',
			tenantId: 'tenant-b',
			type: 'client',
		},
		{ secret: SECRET },
	);

	describe('extractToken', () => {
		it('reads the socket.io auth field', () => {
			const socket = socketWith({ auth: { token: coachToken }, headers: {} });
			expect(service.extractToken(socket)).toBe(coachToken);
		});

		it('reads the Authorization header and strips the scheme', () => {
			const socket = socketWith({
				auth: {},
				headers: { authorization: `Bearer ${coachToken}` },
			});
			expect(service.extractToken(socket)).toBe(coachToken);
		});

		it('ignores query strings — tokens must not end up in access logs', () => {
			const socket = socketWith({
				auth: {},
				headers: {},
				query: { token: coachToken },
			});
			expect(service.extractToken(socket)).toBeNull();
		});
	});

	describe('verify', () => {
		it('resolves a coach token to a coach principal', async () => {
			await expect(service.verify(coachToken)).resolves.toEqual({
				tenantId: 'tenant-a',
				email: 'coach@example.com',
				coachId: 'coach-1',
				clientId: null,
			});
		});

		it('resolves a client token to a client principal', async () => {
			await expect(service.verify(clientToken)).resolves.toEqual({
				tenantId: 'tenant-b',
				email: 'client@example.com',
				coachId: null,
				clientId: 'client-1',
			});
		});

		it('rejects a token signed with a different secret', async () => {
			const forged = jwt.sign(
				{ userId: 'x', tenantId: 'tenant-a', type: 'tenant-user' },
				{ secret: 'someone-elses-secret' },
			);
			await expect(service.verify(forged)).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('rejects an expired token', async () => {
			const expired = jwt.sign(
				{
					userId: 'coach-1',
					email: 'coach@example.com',
					tenantId: 'tenant-a',
					type: 'tenant-user',
				},
				{ secret: SECRET, expiresIn: '-1s' },
			);
			await expect(service.verify(expired)).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('rejects a token with no tenant — the tenant is the whole point', async () => {
			const noTenant = jwt.sign(
				{ userId: 'coach-1', email: 'c@example.com', type: 'tenant-user' },
				{ secret: SECRET },
			);
			await expect(service.verify(noTenant)).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('rejects an unrecognised token type', async () => {
			const odd = jwt.sign(
				{ tenantId: 'tenant-a', type: 'service-account' },
				{ secret: SECRET },
			);
			await expect(service.verify(odd)).rejects.toThrow(UnauthorizedException);
		});
	});

	describe('authenticate', () => {
		it('rejects a handshake carrying no token at all', async () => {
			const socket = socketWith({ auth: {}, headers: {} });
			await expect(service.authenticate(socket)).rejects.toThrow(
				UnauthorizedException,
			);
		});
	});
});
