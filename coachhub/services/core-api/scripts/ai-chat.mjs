#!/usr/bin/env node
/**
 * Talks to the AI chat assistant over the WebSocket, from a terminal.
 *
 * The chat path is WebSocket-only — there is no REST endpoint for it — so there
 * is nothing to curl. This is the equivalent: it logs in, opens an authenticated
 * socket, sends `ai.requested`, and prints whatever comes back.
 *
 *   node scripts/ai-chat.mjs --email coach@acme.com --password secret \
 *        --prompt "What has this client been struggling with?"
 *
 * Run it with no --prompt for an interactive session.
 *
 * Requires socket.io-client:  npm i -D socket.io-client
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// ── Events, straight from src/messaging/events.ts ────────────────────────────
const EV = {
	REQUESTED: 'ai.requested',
	ACCEPTED: 'ai.accepted',
	COMPLETED: 'ai.completed',
	TIMED_OUT: 'ai.timed_out',
	REJECTED: 'ai.rejected',
	UNAUTHORIZED: 'ai.unauthorized',
};

/** Local patience. The server gives up at AI_REQUEST_TIMEOUT_MS (120s); outlast it. */
const ANSWER_TIMEOUT_MS = 180_000;

const USAGE = `
Talk to the CoachHub AI assistant over the WebSocket.

  node scripts/ai-chat.mjs [options]

Authentication (pick one):
  --email <email>        Log in and use the returned access token
  --password <pw>        Prompted for if --email is given without it
  --token <jwt>          Use an access token directly
  --client               Log in via /auth/customer/login instead of /auth/login

Asking:
  --prompt <text>        Ask once, print the answer, exit. Omit for a session.
  --kind <kind>          Request kind (default: advice)
  --membership <uuid>    Scope the answer to one client's own material.
                         Coaches only — a client is always scoped to themselves.

Discovery:
  --clients              List the tenant roster with membership ids, then exit

Other:
  --url <url>            core-api base URL (default: http://localhost:3000)
  --verbose              Trace every frame, with timings
  --help                 This

Environment fallbacks: AI_CHAT_URL, AI_CHAT_EMAIL, AI_CHAT_PASSWORD, AI_CHAT_TOKEN

Examples:
  # One-shot, as a coach, about nobody in particular
  node scripts/ai-chat.mjs --email coach@acme.com --password secret \\
       --prompt "How fast should a beginner add weight to a squat?"

  # Find a client, then ask about them
  node scripts/ai-chat.mjs --email coach@acme.com --password secret --clients
  node scripts/ai-chat.mjs --email coach@acme.com --password secret \\
       --membership 28fa711e-... --prompt "What is this client struggling with?"

  # Interactive, as a client (always scoped to themselves)
  node scripts/ai-chat.mjs --client --email alice@example.com --password secret
`;

// ── Terminal niceties ────────────────────────────────────────────────────────
const color = stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = (t) => paint('2', t);
const bold = (t) => paint('1', t);
const red = (t) => paint('31', t);
const green = (t) => paint('32', t);
const yellow = (t) => paint('33', t);
const blue = (t) => paint('36', t);

let verbose = false;
const trace = (...args) => {
	if (verbose) console.error(dim(`  · ${args.join(' ')}`));
};
const fail = (message) => {
	console.error(`${red('✗')} ${message}`);
	process.exit(1);
};

// ── Argument parsing ─────────────────────────────────────────────────────────
function parseArgs(argv) {
	const flags = new Set(['--client', '--clients', '--verbose', '--help', '-h']);
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

const baseUrl = (args.url ?? process.env.AI_CHAT_URL ?? 'http://localhost:3000')
	.replace(/\/+$/, '');
const kind = args.kind ?? 'advice';
const membershipId = args.membership ?? null;

if (membershipId && !isUuid(membershipId)) {
	fail(`--membership must be a UUID, got "${membershipId}"`);
}

function isUuid(value) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

// ── socket.io-client, resolved late so the error can be a useful one ──────────
async function loadSocketIo() {
	try {
		return (await import('socket.io-client')).io;
	} catch {
		fail(
			'socket.io-client is not installed.\n' +
				`  Install it as a dev dependency:  ${bold('npm i -D socket.io-client')}\n` +
				'  (run that from services/core-api)',
		);
	}
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function post(path, body) {
	const response = await fetch(`${baseUrl}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	const text = await response.text();
	const parsed = text ? safeJson(text) : null;
	if (!response.ok) {
		const detail = parsed?.message ?? parsed?.error ?? text.slice(0, 200);
		throw new Error(`POST ${path} → ${response.status}: ${detail}`);
	}
	return parsed;
}

async function get(path, token) {
	const response = await fetch(`${baseUrl}${path}`, {
		headers: { authorization: `Bearer ${token}` },
	});
	const text = await response.text();
	const parsed = text ? safeJson(text) : null;
	if (!response.ok) {
		const detail = parsed?.message ?? parsed?.error ?? text.slice(0, 200);
		throw new Error(`GET ${path} → ${response.status}: ${detail}`);
	}
	return parsed;
}

function safeJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function resolveToken(rl) {
	const direct = args.token ?? process.env.AI_CHAT_TOKEN;
	if (direct) {
		trace('using the token supplied directly');
		return direct;
	}

	const email = args.email ?? process.env.AI_CHAT_EMAIL;
	if (!email) {
		fail(
			'No credentials. Pass --email (and --password), or --token.\n' +
				`  See ${bold('--help')} for the full list.`,
		);
	}

	let password = args.password ?? process.env.AI_CHAT_PASSWORD;
	if (!password) {
		if (!rl) {
			fail(
				'No password, and stdin is a pipe so there is nothing to prompt.\n' +
					'  Pass --password, or set AI_CHAT_PASSWORD.',
			);
		}
		// Not hidden — this is a dev tool against a dev database, and pretending
		// otherwise with a fake masked prompt would be worse than saying so.
		password = await rl.question(dim(`password for ${email}: `));
	}

	const path = args.client ? '/auth/customer/login' : '/auth/login';
	trace(`POST ${path}`);
	const result = await post(path, { email, password });

	if (!result?.accessToken) {
		throw new Error(`${path} returned no accessToken`);
	}
	const who = args.client ? 'client' : 'coach';
	console.error(dim(`  logged in as ${who} ${email}`));
	return result.accessToken;
}

/** What the token says, without verifying it — for display only. */
function describeToken(token) {
	try {
		const body = token.split('.')[1];
		const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
		return {
			type: claims.type ?? 'unknown',
			tenantId: claims.tenantId ?? null,
			email: claims.email ?? null,
			expiresAt: claims.exp ? new Date(claims.exp * 1000) : null,
		};
	} catch {
		return null;
	}
}

// ── The roster ───────────────────────────────────────────────────────────────
async function listClients(token) {
	const page = await get('/memberships?limit=50', token);
	const rows = page?.docs ?? [];
	if (rows.length === 0) {
		console.log(yellow('No memberships in this tenant.'));
		return;
	}

	console.log(bold(`\n${rows.length} membership(s)\n`));
	for (const row of rows) {
		const name =
			`${row.client?.firstName ?? ''} ${row.client?.lastName ?? ''}`.trim() ||
			row.client?.email ||
			'(unnamed)';
		const intake = row.hasIntake ? green('intake') : dim('no intake');
		console.log(`  ${bold(name)}  ${dim(row.client?.email ?? '')}`);
		console.log(`  ${row.membershipId}  ${dim(row.status)}  ${intake}\n`);
	}
	console.log(dim('Pass one of these to --membership to scope a question.\n'));
}

// ── Asking ───────────────────────────────────────────────────────────────────
/**
 * Sends one question and settles when the assistant answers.
 *
 * Every terminal event resolves rather than rejects: a refusal is an outcome to
 * print, not a crash. Only a lost connection or a local timeout is exceptional.
 */
function ask(socket, prompt) {
	return new Promise((resolve) => {
		const startedAt = Date.now();
		let requestId = null;
		let settled = false;

		const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

		const finish = (outcome) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.off(EV.ACCEPTED, onAccepted);
			socket.off(EV.COMPLETED, onCompleted);
			socket.off(EV.TIMED_OUT, onTimedOut);
			socket.off(EV.REJECTED, onRejected);
			resolve({ ...outcome, tookMs: Date.now() - startedAt });
		};

		const timer = setTimeout(
			() =>
				finish({
					status: 'no-answer',
					text: `Nothing came back within ${ANSWER_TIMEOUT_MS / 1000}s. The server gives up at AI_REQUEST_TIMEOUT_MS — check the ai-service logs.`,
				}),
			ANSWER_TIMEOUT_MS,
		);

		// The gateway acknowledges before ai-service has seen anything: this only
		// means the request reached RabbitMQ.
		const onAccepted = (payload) => {
			requestId = payload?.requestId ?? null;
			trace(`${EV.ACCEPTED} requestId=${requestId} (${elapsed()})`);
			// Only on a terminal: this line gets erased when the answer lands, and the
			// erase sequence would otherwise show up as literal bytes in a pipe or a log.
			if (!verbose && stdout.isTTY) stdout.write(dim('  thinking… '));
		};

		// One socket can have several questions in flight, and every completion
		// arrives on the same connection — so pair on requestId, not arrival order.
		const onCompleted = (payload) => {
			if (requestId && payload?.requestId && payload.requestId !== requestId) {
				trace(`ignoring a completion for ${payload.requestId}`);
				return;
			}
			trace(`${EV.COMPLETED} status=${payload?.status} (${elapsed()})`);
			finish({
				status: payload?.status === 'succeeded' ? 'ok' : 'failed',
				text: payload?.summary ?? '(no summary in the payload)',
			});
		};

		const onTimedOut = (payload) => {
			if (requestId && payload?.requestId && payload.requestId !== requestId) {
				return;
			}
			finish({
				status: 'failed',
				text: 'The server timed out waiting for ai-service.',
			});
		};

		// Validation, not generation — the socket stays open, so this is recoverable.
		const onRejected = (payload) =>
			finish({ status: 'rejected', text: payload?.message ?? 'rejected' });

		socket.on(EV.ACCEPTED, onAccepted);
		socket.on(EV.COMPLETED, onCompleted);
		socket.on(EV.TIMED_OUT, onTimedOut);
		socket.on(EV.REJECTED, onRejected);

		const body = { kind, prompt };
		if (membershipId) body.membershipId = membershipId;
		trace(`emit ${EV.REQUESTED} ${JSON.stringify(body)}`);
		socket.emit(EV.REQUESTED, body);
	});
}

function printAnswer(result) {
	if (!verbose && stdout.isTTY) stdout.write('\r\x1b[K');
	const took = dim(`(${(result.tookMs / 1000).toFixed(1)}s)`);

	if (result.status === 'ok') {
		console.log(`\n${green('assistant')} ${took}\n`);
		console.log(indent(result.text));
		console.log();
		return true;
	}

	const label = { rejected: 'rejected', failed: 'failed', 'no-answer': 'no answer' }[
		result.status
	];
	console.log(`\n${red(label)} ${took}\n`);
	console.log(indent(result.text));
	console.log();
	return false;
}

const indent = (text) =>
	String(text)
		.split('\n')
		.map((line) => `  ${line}`)
		.join('\n');

// ── Connecting ───────────────────────────────────────────────────────────────
function connect(io, token) {
	return new Promise((resolve, reject) => {
		// The `auth.token` handshake field is what WsAuthService reads first. A query
		// string would be rejected on purpose — tokens end up in access logs there.
		const socket = io(baseUrl, {
			auth: { token },
			transports: ['websocket'],
			reconnection: false,
		});

		// The gateway emits this and then disconnects, so catch it before the
		// disconnect handler reports something vaguer.
		socket.on(EV.UNAUTHORIZED, (payload) => {
			reject(
				new Error(
					`Rejected by the gateway: ${payload?.message ?? 'Unauthorized'}. The token is invalid or expired.`,
				),
			);
		});

		socket.on('connect', () => {
			trace(`connected, socket id ${socket.id}`);
			resolve(socket);
		});

		socket.on('connect_error', (error) =>
			reject(
				new Error(
					`Could not reach ${baseUrl}: ${error.message}. Is core-api running?`,
				),
			),
		);
	});
}

// ── Modes ────────────────────────────────────────────────────────────────────
async function runOnce(socket, prompt) {
	console.log(`\n${blue('you')}\n`);
	console.log(indent(prompt));
	const result = await ask(socket, prompt);
	return printAnswer(result);
}

async function runInteractive(socket, rl) {
	console.log(dim('\nType a question. Ctrl-C, or an empty line, to quit.\n'));
	for (;;) {
		let prompt;
		try {
			prompt = (await rl.question(`${blue('you')} ${dim('›')} `)).trim();
		} catch {
			// stdin ended — Ctrl-D, or the terminal going away. That is a quit, not a
			// fault, and reporting it as "readline was closed" helps nobody.
			console.log();
			return true;
		}
		if (!prompt) {
			return true;
		}
		const result = await ask(socket, prompt);
		printAnswer(result);
	}
}

/**
 * Everything on stdin, as one prompt.
 *
 * A piped question cannot drive the interactive loop: stdin is drained and closed
 * before the first turn is even asked for. Reading it as a single prompt is both
 * what the shape of the input means and what `echo ... | ai:chat` should do.
 */
function readPipedPrompt() {
	return new Promise((resolve, reject) => {
		let text = '';
		stdin.setEncoding('utf8');
		stdin.on('data', (chunk) => (text += chunk));
		stdin.on('end', () => resolve(text.trim()));
		stdin.on('error', reject);
	});
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
	// Only take over stdin when it is a terminal. On a pipe it holds the question,
	// and a readline interface would swallow it.
	const onTerminal = Boolean(stdin.isTTY);
	const rl = onTerminal ? createInterface({ input: stdin, output: stdout }) : null;
	let socket = null;

	try {
		const io = await loadSocketIo();

		let prompt = args.prompt ?? null;
		if (!prompt && !onTerminal && !args.clients) {
			prompt = await readPipedPrompt();
			if (!prompt) {
				fail('Nothing on stdin and no --prompt, so there is no question to ask.');
			}
		}

		const token = await resolveToken(rl);

		const claims = describeToken(token);
		if (claims) {
			trace(`token type=${claims.type} tenant=${claims.tenantId}`);
			if (claims.expiresAt && claims.expiresAt < new Date()) {
				fail(`That access token expired at ${claims.expiresAt.toISOString()}.`);
			}
			if (claims.type === 'client' && membershipId) {
				console.error(
					yellow(
						'  note: --membership is ignored for a client token — a client is always scoped to themselves',
					),
				);
			}
		}

		if (args.clients) {
			if (claims?.type === 'client') {
				fail('--clients is a coach endpoint; this is a client token.');
			}
			await listClients(token);
			return 0;
		}

		socket = await connect(io, token);
		console.error(
			dim(
				`  connected to ${baseUrl}${membershipId ? `, scoped to membership ${membershipId}` : ''}`,
			),
		);

		const ok = prompt
			? await runOnce(socket, prompt)
			: await runInteractive(socket, rl);
		return ok ? 0 : 1;
	} finally {
		socket?.close();
		rl?.close();
	}
}

main()
	.then((code) => process.exit(code))
	.catch((error) => fail(error.message));
