import { Module } from '@nestjs/common';
import { Tenant } from './entities/tenant.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3UploadModule } from '../s3-upload/s3-upload.module';

@Module({
	imports: [TypeOrmModule.forFeature([Tenant]), S3UploadModule],
	controllers: [TenantController],
	providers: [TenantService],
	exports: [TenantService, TypeOrmModule],
})
export class TenantModule {}
