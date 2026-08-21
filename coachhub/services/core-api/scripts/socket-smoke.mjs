#!/usr/bin/env node
/**
 * Smoke-tests both WebSocket gateways against a running core-api.
 *
 * Neither gateway has a REST surface, so nothing here can be curled and nothing
 * here is covered by `npm test` — the unit specs mock the socket. This is the
 * end-to-end check: it logs in as a real coach and a real client, opens real
 * sockets through whatever URL you point it at, and asserts what comes back.
 *
 *   node scripts/socket-smoke.mjs                      # localhost
 *   node scripts/socket-smoke.mjs --url https://api.example.com
 *
 * Exits non-zero if any check fails, so it works as a deploy gate.
 *
 * The chat checks are also the only test of the Redis Socket.IO adapter: the
 * coach and the client are two independent connections, so on a multi-replica
 * deployment they routinely land on different pods, and a message only crosses
 * between them if broadcasts are being republished over Redis.
 *
 * Requires socket.io-client (already a devDependency).
 */

// ── Events, straight from src/messaging/events.ts and src/chat/chat.gateway.ts ─
const AI = {
	REQUESTED: 'ai.requested',
	ACCEPTED: 'ai.accepted',
	COMPLETED: 'ai.completed',
	TIMED_OUT: 'ai.timed_out',
	REJECTED: 'ai.rejected',
	UNAUTHORIZED: 'ai.unauthorized',
};

const CHAT = {
	JOIN: 'conversation:join',
	SEND: 'message:send',
	TYPING: 'typing',
	NEW: 'message:new',
	UPDATED: 'conversation:updated',
};

/** The AI gateway gives up at AI_REQUEST_TIMEOUT_MS (30s); outlast it. */
const ANSWER_TIMEOUT_MS = 60_000;
/** Chat is a database write and a room broadcast — a second is already slow. */
const CHAT_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 15_000;

const USAGE = `
Smoke-test the AI and chat WebSocket gateways end to end.

  node scripts/socket-smoke.mjs [options]

  --url <url>              core-api base URL (default: http://localhost:3000)
  --coach <email>          Coach account (default: coach1@demo.coachhub.test)
  --client <email>         Client account. Default: the first active member of
                           the coach's roster, discovered over the API.
  --password <pw>          Password for both (default: password123)
  --coach-password <pw>    Override just the coach's
  --client-password <pw>   Override just the client's
  --skip-ai                Chat checks only. Useful when the Gemini free-tier
                           daily quota is spent — a failed answer then means
                           nothing.
  --verbose                Print every frame
  --help

Environment fallbacks: SMOKE_URL, SMOKE_COACH, SMOKE_CLIENT, SMOKE_PASSWORD
`;

// ── Output ───────────────────────────────────────────────────────────────────
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = (t) => paint('1', t);
const dim = (t) => paint('2', t);
const red = (t) => paint('31', t);
const green = (t) => paint('32', t);
const yellow = (t) => paint('33', t);

let verbose = false;
const trace = (...args) => {
	if (verbose) console.error(dim(`    · ${args.join(' ')}`));
};
const fail = (message) => {
	console.error(`${red('✗')} ${message}`);
	process.exit(1);
};

// ── Arguments ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
	const flags = new Set(['--skip-ai', '--verbose', '--help', '-h']);
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (!token.startsWith('--') && token !== '-h') {
			fail(`Unexpected argument: ${token}`);
		}
		const key = token.replace(/^--/, '').replace(/^-h$/, 'help');
		if (flags.has(token)) {
			args[key] = true;
			continue;
		}
		const value = argv[++i];
		if (value === undefined) {
			fail(`${token} needs a value`);
		}
		args[key] = value;
	}
	return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(USAGE);
	process.exit(0);
}
verbose = Boolean(args.verbose);

const baseUrl = (
	args.url ??
	process.env.SMOKE_URL ??
	'http://localhost:3000'
).replace(/\/+$/, '');
const sharedPassword =
	args.password ?? process.env.SMOKE_PASSWORD ?? 'password123';
const coachEmail =
	args.coach ?? process.env.SMOKE_COACH ?? 'coach1@demo.coachhub.test';
const coachPassword = args['coach-password'] ?? sharedPassword;
const clientPassword = args['client-password'] ?? sharedPassword;

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function request(path, init) {
	const response = await fetch(`${baseUrl}${path}`, init);
	const text = await response.text();
	let parsed = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = null;
	}
	if (!response.ok) {
		const detail = parsed?.message ?? parsed?.error ?? text.slice(0, 200);
		throw new Error(`${path} → ${response.status}: ${detail}`);
	}
	return parsed;
}

const post = (path, body) =>
	request(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

const get = (path, token) =>
	request(path, { headers: { authorization: `Bearer ${token}` } });

// ── The check harness ────────────────────────────────────────────────────────
const results = [];

/**
 * Runs one check. A thrown error is a failure, not a crash — the run always
 * reaches the summary, because "the first failure hid the other four" is how a
 * smoke test wastes a debugging session.
 */
async function check(name, fn) {
	const startedAt = Date.now();
	try {
		const note = await fn();
		const ms = Date.now() - startedAt;
		results.push({ name, ok: true });
		console.log(
			`  ${green('✓')} ${name} ${dim(`${ms}ms`)}${note ? dim(` — ${note}`) : ''}`,
		);
	} catch (error) {
		results.push({ name, ok: false, error });
		console.log(`  ${red('✗')} ${name}`);
		console.log(`      ${red(error.message)}`);
	}
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

// ── Socket helpers ───────────────────────────────────────────────────────────
let io;

/**
 * Opens a socket and settles on whichever comes first: connect or refusal.
 *
 * Also returns a `dropped` promise that resolves with the disconnect reason.
 * It is armed before the socket can emit anything, because a gateway that
 * refuses *after* the handshake drops the connection within a millisecond or
 * two of `connect` — attaching a listener once the caller has the socket races
 * that teardown and loses roughly half the time.
 */
function open(namespace, options) {
	return new Promise((resolve) => {
		const socket = io(`${baseUrl}${namespace}`, {
			transports: ['websocket'],
			reconnection: false,
			timeout: CONNECT_TIMEOUT_MS,
			...options,
		});
		let recordDrop;
		const dropped = new Promise((r) => {
			recordDrop = r;
		});
		let settled = false;
		const settle = (outcome) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ socket, dropped, ...outcome });
		};
		const timer = setTimeout(
			() => settle({ status: 'timeout' }),
			CONNECT_TIMEOUT_MS + 2000,
		);
		socket.on('connect', () => {
			trace(`${namespace || '/'} connected ${socket.id}`);
			settle({ status: 'connected' });
		});
		socket.on('connect_error', (err) => {
			trace(`${namespace || '/'} connect_error ${err.message}`);
			settle({ status: 'connect_error', message: err.message, data: err.data });
		});
		socket.on('disconnect', (reason) => {
			trace(`${namespace || '/'} disconnected: ${reason}`);
			recordDrop(reason);
			settle({ status: 'disconnected', message: reason });
		});
	});
}

/** Resolves with the disconnect reason, or null if the socket stayed up. */
function droppedWithin(dropped, ms) {
	return Promise.race([
		dropped,
		new Promise((resolve) => setTimeout(() => resolve(null), ms)),
	]);
}

/** Resolves with the first matching event payload, or throws on timeout. */
function waitFor(socket, event, predicate = () => true, ms = CHAT_TIMEOUT_MS) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off(event, onEvent);
			reject(new Error(`timed out after ${ms}ms waiting for "${event}"`));
		}, ms);
		function onEvent(payload) {
			if (!predicate(payload)) return;
			clearTimeout(timer);
			socket.off(event, onEvent);
			trace(`${event} ${JSON.stringify(payload).slice(0, 120)}`);
			resolve(payload);
		}
		socket.on(event, onEvent);
	});
}

/** Emits and resolves with the server's ack, which chat uses for every reply. */
function emitWithAck(socket, event, payload, ms = CHAT_TIMEOUT_MS) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`no ack for "${event}" within ${ms}ms`)),
			ms,
		);
		socket.emit(event, payload, (ack) => {
			clearTimeout(timer);
			trace(`${event} ack ${JSON.stringify(ack).slice(0, 120)}`);
			resolve(ack);
		});
	});
}

/** Rejects if the promise settles — used to prove something is NOT delivered. */
async function expectSilence(promise, ms, message) {
	const quiet = Symbol('quiet');
	const outcome = await Promise.race([
		promise.catch(() => quiet),
		new Promise((resolve) => setTimeout(() => resolve(quiet), ms)),
	]);
	assert(outcome === quiet, message);
}

const closeAll = (...sockets) => {
	for (const socket of sockets) {
		try {
			socket?.close();
		} catch {
			/* already gone */
		}
	}
};

const nonce = () => Math.random().toString(36).slice(2, 10);

// ── Suites ───────────────────────────────────────────────────────────────────
async function aiSuite(coachToken) {
	console.log(`\n${bold('AI gateway')} ${dim('(default namespace)')}`);

	await check('refuses a connection with no token', async () => {
		const { socket, status, data } = await open('', {});
		closeAll(socket);
		assert(status === 'connect_error', `expected connect_error, got ${status}`);
		assert(
			data?.code === 'NO_TOKEN',
			`expected code NO_TOKEN, got ${JSON.stringify(data)}`,
		);
		return 'NO_TOKEN';
	});

	await check('refuses a token that does not verify', async () => {
		const { socket, status, data } = await open('', {
			auth: { token: 'not-a-real-jwt' },
		});
		closeAll(socket);
		assert(status === 'connect_error', `expected connect_error, got ${status}`);
		assert(
			data?.code === 'INVALID_TOKEN',
			`expected code INVALID_TOKEN, got ${JSON.stringify(data)}`,
		);
		return 'INVALID_TOKEN';
	});

	await check('accepts a valid coach token', async () => {
		const { socket, status, message } = await open('', {
			auth: { token: coachToken },
		});
		closeAll(socket);
		assert(
			status === 'connected',
			`expected connected, got ${status} ${message ?? ''}`,
		);
	});

	await check(
		'rejects a malformed request without closing the socket',
		async () => {
			const { socket, status } = await open('', {
				auth: { token: coachToken },
			});
			assert(status === 'connected', `could not connect: ${status}`);
			try {
				const rejected = waitFor(socket, AI.REJECTED, () => true);
				socket.emit(AI.REQUESTED, { kind: 'general', prompt: '   ' });
				const payload = await rejected;
				assert(
					typeof payload?.message === 'string' && payload.message.length > 0,
					'ai.rejected carried no message',
				);
				// The distinction that matters: a bad request is not an auth failure,
				// so the connection survives it and the client can simply try again.
				assert(socket.connected, 'socket was closed by a malformed request');
				return payload.message;
			} finally {
				closeAll(socket);
			}
		},
	);

	await check('answers a question end to end', async () => {
		const { socket, status } = await open('', { auth: { token: coachToken } });
		assert(status === 'connected', `could not connect: ${status}`);
		try {
			const startedAt = Date.now();
			const accepted = waitFor(
				socket,
				AI.ACCEPTED,
				() => true,
				CHAT_TIMEOUT_MS,
			);
			const settled = Promise.race([
				waitFor(socket, AI.COMPLETED, () => true, ANSWER_TIMEOUT_MS),
				waitFor(socket, AI.TIMED_OUT, () => true, ANSWER_TIMEOUT_MS).then(
					() => {
						throw new Error('server emitted ai.timed_out');
					},
				),
			]);
			socket.emit(AI.REQUESTED, {
				kind: 'general',
				prompt: 'In one short sentence, what is progressive overload?',
			});

			const ack = await accepted;
			assert(ack?.requestId, 'ai.accepted carried no requestId');

			const done = await settled;
			assert(
				done.requestId === ack.requestId,
				`answer was for ${done.requestId}, asked ${ack.requestId}`,
			);
			// The free Gemini tier allows 20 requests per day, and running this
			// suite a few times is enough to spend it. That failure says nothing
			// about the socket, so name it rather than leaving someone to debug a
			// gateway that is working.
			if (
				done.status !== 'succeeded' &&
				/429|quota|RESOURCE_EXHAUSTED/i.test(done.summary ?? '')
			) {
				throw new Error(
					'Gemini daily quota is spent (free tier: 20 requests/day) — ' +
						'the socket delivered the failure correctly. Re-run with --skip-ai, ' +
						'or wait for the quota to reset.',
				);
			}
			assert(
				done.status === 'succeeded',
				`generation failed: ${done.status} ${done.summary ?? ''}`,
			);
			assert(
				typeof done.summary === 'string' && done.summary.trim().length > 0,
				'answer text (summary) was empty',
			);
			return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
		} finally {
			closeAll(socket);
		}
	});
}

async function chatSuite(coachToken, clientToken, clientId) {
	console.log(`\n${bold('Chat gateway')} ${dim('(/chat namespace)')}`);

	await check('refuses a connection with no token', async () => {
		const { socket, status, dropped } = await open('/chat', {});
		try {
			// Unlike the AI gateway, this one authenticates *after* the handshake,
			// so `connect` fires and the socket is dropped immediately afterwards.
			// Either shape is a pass; what must never happen is the socket staying
			// open and able to send.
			if (status !== 'connected') {
				return status;
			}
			const reason = await droppedWithin(dropped, 5000);
			assert(
				reason !== null,
				'an unauthenticated socket connected and was never dropped',
			);
			return `dropped after connect (${reason})`;
		} finally {
			closeAll(socket);
		}
	});

	await check('connects a coach and a client', async () => {
		const coach = await open('/chat', { auth: { token: coachToken } });
		const client = await open('/chat', { auth: { token: clientToken } });
		closeAll(coach.socket, client.socket);
		assert(coach.status === 'connected', `coach: ${coach.status}`);
		assert(client.status === 'connected', `client: ${client.status}`);
	});

	await check('the coach can open the client thread', async () => {
		const { socket, status } = await open('/chat', {
			auth: { token: coachToken },
		});
		assert(status === 'connected', `could not connect: ${status}`);
		try {
			const ack = await emitWithAck(socket, CHAT.JOIN, { clientId });
			assert(ack?.ok, `join refused: ${ack?.error}`);
		} finally {
			closeAll(socket);
		}
	});

	await check("a client's message reaches the coach", async () => {
		const coach = await open('/chat', { auth: { token: coachToken } });
		const client = await open('/chat', { auth: { token: clientToken } });
		assert(coach.status === 'connected', `coach: ${coach.status}`);
		assert(client.status === 'connected', `client: ${client.status}`);
		try {
			const join = await emitWithAck(coach.socket, CHAT.JOIN, { clientId });
			assert(join?.ok, `coach could not join: ${join?.error}`);

			const body = `smoke ${nonce()}`;
			const inThread = waitFor(coach.socket, CHAT.NEW, (m) => m?.body === body);
			const inInbox = waitFor(
				coach.socket,
				CHAT.UPDATED,
				(u) => u?.lastMessage?.body === body,
			);

			const ack = await emitWithAck(client.socket, CHAT.SEND, { body });
			assert(ack?.ok, `send refused: ${ack?.error}`);

			const delivered = await inThread;
			assert(
				delivered.clientId === clientId,
				`message was tagged ${delivered.clientId}, expected ${clientId}`,
			);
			// The coach's inbox badge relies on this second broadcast, to a
			// different room, so a thread that works while the badge is silent is
			// still a bug.
			await inInbox;
		} finally {
			closeAll(coach.socket, client.socket);
		}
	});

	await check("a coach's reply reaches the client", async () => {
		const coach = await open('/chat', { auth: { token: coachToken } });
		const client = await open('/chat', { auth: { token: clientToken } });
		assert(coach.status === 'connected', `coach: ${coach.status}`);
		assert(client.status === 'connected', `client: ${client.status}`);
		try {
			const body = `smoke reply ${nonce()}`;
			const clientMsgId = `smoke-${nonce()}`;
			const delivered = waitFor(
				client.socket,
				CHAT.NEW,
				(m) => m?.body === body,
			);

			// Deliberately no conversation:join first — a coach's first message is
			// supposed to open the thread it has not joined yet.
			const ack = await emitWithAck(coach.socket, CHAT.SEND, {
				clientId,
				body,
				clientMsgId,
			});
			assert(ack?.ok, `send refused: ${ack?.error}`);

			const message = await delivered;
			assert(
				message.clientMsgId === clientMsgId,
				`clientMsgId did not round-trip: got ${message.clientMsgId}`,
			);
		} finally {
			closeAll(coach.socket, client.socket);
		}
	});

	await check(
		'typing reaches the other side and is not echoed back',
		async () => {
			const coach = await open('/chat', { auth: { token: coachToken } });
			const client = await open('/chat', { auth: { token: clientToken } });
			assert(coach.status === 'connected', `coach: ${coach.status}`);
			assert(client.status === 'connected', `client: ${client.status}`);
			try {
				const join = await emitWithAck(coach.socket, CHAT.JOIN, { clientId });
				assert(join?.ok, `coach could not join: ${join?.error}`);

				const seenByCoach = waitFor(
					coach.socket,
					CHAT.TYPING,
					(t) => t?.isTyping,
				);
				const echoedToSender = waitFor(
					client.socket,
					CHAT.TYPING,
					() => true,
					3000,
				);

				const ack = await emitWithAck(client.socket, CHAT.TYPING, {
					isTyping: true,
				});
				assert(ack?.ok, `typing refused: ${ack?.error}`);

				await seenByCoach;
				await expectSilence(
					echoedToSender,
					2500,
					'typing was echoed back to the sender',
				);
			} finally {
				closeAll(coach.socket, client.socket);
			}
		},
	);

	await check(
		'a coach cannot post into a thread outside the tenant',
		async () => {
			const { socket, status } = await open('/chat', {
				auth: { token: coachToken },
			});
			assert(status === 'connected', `could not connect: ${status}`);
			try {
				const ack = await emitWithAck(socket, CHAT.SEND, {
					clientId: '00000000-0000-4000-8000-000000000000',
					body: `smoke intrusion ${nonce()}`,
				});
				assert(
					ack?.ok === false,
					'a message to a client outside the tenant was accepted',
				);
				// The socket has to survive it: a negative ack is a refusal, not a
				// protocol error, so the coach keeps their other threads.
				assert(socket.connected, 'the socket was closed instead of acked');
				return ack.error;
			} finally {
				closeAll(socket);
			}
		},
	);
}

// ── Run ──────────────────────────────────────────────────────────────────────
async function main() {
	try {
		io = (await import('socket.io-client')).io;
	} catch {
		fail(
			'socket.io-client is not installed.\n' +
				`  Run ${bold('npm install')} from services/core-api.`,
		);
	}

	console.log(`\n${bold('Socket smoke test')}  ${dim(baseUrl)}`);

	// Sign in first: without both identities there is nothing worth running, so
	// this is the one place a failure is fatal rather than a recorded result.
	let coachToken;
	let clientToken;
	let clientId;
	let clientEmail = args.client ?? process.env.SMOKE_CLIENT ?? null;

	try {
		const coachLogin = await post('/auth/login', {
			email: coachEmail,
			password: coachPassword,
		});
		coachToken = coachLogin?.accessToken;
		assert(coachToken, 'login returned no accessToken');
		trace(`coach ${coachEmail} signed in`);

		const roster = await get('/memberships?limit=50&status=active', coachToken);
		const members = roster?.docs ?? [];
		assert(
			members.length > 0,
			`${coachEmail} has no active clients — chat needs a conversation. ` +
				'Seed the demo data first (npm run seed:demo).',
		);

		const member = clientEmail
			? members.find((row) => row.client?.email === clientEmail)
			: members[0];
		assert(member, `${clientEmail} is not an active client of ${coachEmail}`);
		clientEmail = member.client.email;
		clientId = member.client.id;

		const clientLogin = await post('/auth/customer/login', {
			email: clientEmail,
			password: clientPassword,
		});
		clientToken = clientLogin?.accessToken;
		assert(clientToken, 'client login returned no accessToken');
		trace(`client ${clientEmail} signed in (${clientId})`);
	} catch (error) {
		fail(`Setup failed: ${error.message}`);
	}

	console.log(
		`${dim('coach')} ${coachEmail}  ${dim('client')} ${clientEmail}\n` +
			dim(`clientId ${clientId}`),
	);

	if (args['skip-ai']) {
		console.log(`\n${yellow('› skipping the AI gateway (--skip-ai)')}`);
	} else {
		await aiSuite(coachToken);
	}
	await chatSuite(coachToken, clientToken, clientId);

	const failed = results.filter((r) => !r.ok);
	const line = `${results.length - failed.length}/${results.length} checks passed`;
	console.log(
		failed.length === 0
			? `\n${green('✓')} ${bold(line)}\n`
			: `\n${red('✗')} ${bold(line)}\n`,
	);
	process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error(`\n${red('✗')} ${error.stack ?? error.message}`);
	process.exit(1);
});
