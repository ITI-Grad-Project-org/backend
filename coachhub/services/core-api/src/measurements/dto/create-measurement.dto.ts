import { OmitType } from '@nestjs/swagger';
import { LogMeasurementDto } from './log-measurement.dto';

export class CreateMeasurementDto extends OmitType(LogMeasurementDto, [
	'membershipId',
] as const) {}
