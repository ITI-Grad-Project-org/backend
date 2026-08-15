import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientMembership } from '../clients/entities/client-membership.entity';
import { Checkin } from './entities/checkin.entity';

@Module({
	imports: [TypeOrmModule.forFeature([Checkin, ClientMembership])],
	exports: [TypeOrmModule],
})
export class CheckinsModule {}
