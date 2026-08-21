import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, ServerOptions } from 'socket.io';

type RedisClient = ReturnType<typeof createClient>;

/**
 * Socket.IO adapter that republishes every broadcast over Redis pub/sub.
 *
 * core-api runs more than one replica, and a Socket.IO room only exists inside
 * the process that created it. Without a shared adapter `server.to(room).emit()`
 * reaches the sockets held by *this* pod and nobody else — so an `ai.completed`
 * message consumed by pod B is emitted into an empty room while the browser
 * waits on pod A, and the request surfaces as AI_TIMED_OUT instead of an
 * answer. `core-api.ai-completed.q` has one consumer per pod, so RabbitMQ
 * round-robins which pod that is: roughly half of all answers were lost. Chat
 * has the same hole whenever a coach and a client land on different pods.
 *
 * This fixes delivery only, not the handshake. An engine.io long-polling
 * session still lives on the single pod that issued its `sid`, which is why the
 * Ingress also pins a session with a cookie — see
 * deploy/k8s/50-ingress/ingress.yaml.
 */
export class RedisIoAdapter extends IoAdapter {
	private readonly logger = new Logger(RedisIoAdapter.name);
	private adapterConstructor?: ReturnType<typeof createAdapter>;
	private clients: RedisClient[] = [];

	constructor(app: INestApplicationContext) {
		super(app);
	}

	/**
	 * Opens the publisher/subscriber pair. Call before `app.listen()`, otherwise
	 * the gateways are built against the in-memory adapter.
	 *
	 * @returns true when broadcasts will cross pods, false when this pod fell
	 *   back to in-memory delivery.
	 */
	async connect(url: string): Promise<boolean> {
		const pubClient = createClient({ url });
		const subClient = pubClient.duplicate();
		this.clients = [pubClient, subClient];

		// node-redis emits 'error' on every dropped connection, and an unhandled
		// 'error' event takes the process down with it. A blip must not kill the API.
		pubClient.on('error', (error: unknown) =>
			this.logDropped('publisher', error),
		);
		subClient.on('error', (error: unknown) =>
			this.logDropped('subscriber', error),
		);

		try {
			await Promise.all([pubClient.connect(), subClient.connect()]);
		} catch (error) {
			// Degraded, not dead: HTTP keeps serving and sockets still work for anyone
			// who stays on one pod. Logged loudly, because on multiple replicas this
			// silently drops AI answers and chat messages.
			this.logger.error(
				`redis unavailable at ${redacted(url)} — websocket broadcasts will NOT ` +
					`cross pods; AI answers and chat may be dropped. ${messageOf(error)}`,
			);
			await this.disconnect();
			return false;
		}

		this.adapterConstructor = createAdapter(pubClient, subClient);
		this.logger.log('websocket broadcasts are shared across pods via redis');
		return true;
	}

	createIOServer(port: number, options?: ServerOptions): Server {
		const server: Server = super.createIOServer(port, options);
		if (this.adapterConstructor) {
			// Applies to namespaces already built as well as later ones, so both the
			// default namespace (AiGateway) and /chat (ChatGateway) are covered.
			server.adapter(this.adapterConstructor);
		}
		return server;
	}

	async disconnect(): Promise<void> {
		const clients = this.clients;
		this.clients = [];
		await Promise.all(
			clients.map((client) =>
				// destroy() rather than quit(): quit() needs a live socket, and the case
				// this is reached from is usually one that no longer has one.
				Promise.resolve()
					.then(() => client.destroy())
					.catch(() => undefined),
			),
		);
	}

	private logDropped(role: string, error: unknown): void {
		this.logger.warn(`redis ${role} connection error: ${messageOf(error)}`);
	}
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Keeps any password in REDIS_URL out of the logs. */
function redacted(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.password) {
			parsed.password = '***';
		}
		return parsed.toString();
	} catch {
		return 'redis';
	}
}
