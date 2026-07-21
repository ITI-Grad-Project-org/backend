import { ApiProperty } from '@nestjs/swagger';
import { Length, Matches } from 'class-validator';

/**
 * The client types the 6-digit code from either the invite or the
 * request-approval email — both flows land on the same "enter your code"
 * screen, so a single shape covers both.
 */
export class ValidateOnboardingDto {
	@ApiProperty({
		example: '482013',
		description: '6-digit code from the invite or approval email',
	})
	@Length(6, 6)
	@Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
	code: string;
}
