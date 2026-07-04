import { Controller, Get } from '@nestjs/common';
import {
	HealthCheck,
	HealthCheckService,
	TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth';

@Controller('health')
export class HealthController {
	constructor(
		private health: HealthCheckService,
		private db: TypeOrmHealthIndicator,
	) {}

	@Public()
	@Get()
	@HealthCheck()
	check() {
		return this.health.check([() => this.db.pingCheck('database')]);
	}
}
