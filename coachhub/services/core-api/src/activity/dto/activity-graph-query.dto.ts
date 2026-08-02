import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

function parseFourDigitYear({ value }: { value: unknown }) {
	if (typeof value === 'number') return value;
	if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return Number.NaN;
	return Number(value);
}

export class ActivityGraphQueryDto {
	@ApiPropertyOptional({
		example: 2025,
		description:
			'Calendar year to return. Omit it to return the latest 365 dates.',
	})
	@IsOptional()
	@Transform(parseFourDigitYear)
	@IsInt()
	@Min(2000)
	@Max(3000)
	year?: number;
}
