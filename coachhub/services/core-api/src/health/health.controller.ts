import { Controller, Get } from '@nestjs/common';
import {
	HealthCheck,
	HealthCheckError,
	HealthCheckService,
	HealthIndicatorResult,
	TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Public } from '../auth';

@Controller('health')
export class HealthController {
	constructor(
		private health: HealthCheckService,
		private db: TypeOrmHealthIndicator,
		private amqp: AmqpConnection,
	) {}

	@Public()
	@Get()
	@HealthCheck()
	check() {
		return this.health.check([
			() => this.db.pingCheck('database'),
			() => this.rabbitCheck(),
		]);
	}

	private rabbitCheck(): HealthIndicatorResult {
		const isUp = this.amqp.connected;
		const result: HealthIndicatorResult = {
			rabbitmq: { status: isUp ? 'up' : 'down' },
		};
		if (!isUp) {
			throw new HealthCheckError('RabbitMQ connection is down', result);
		}
		return result;
	}
}
