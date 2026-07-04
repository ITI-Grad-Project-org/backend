import { OmitType, PartialType } from '@nestjs/swagger';
import { RegisterCoachDto } from './register-coach.dto';

export class UpdateCoachDto extends PartialType(
	OmitType(RegisterCoachDto, [
		'password',
		'confirmPassword',
		'businessName',
		'timezone',
		'currency',
	] as const),
) {}
