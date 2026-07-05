import { Module } from '@nestjs/common';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
	imports: [TypeOrmModule.forFeature([Tenant])],
	controllers: [TenantController],
	providers: [TenantService],
	exports: [TenantService],
})
export class TenantModule {}
