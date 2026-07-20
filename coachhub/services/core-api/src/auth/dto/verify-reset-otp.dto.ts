import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyResetOtpDto {
	@ApiProperty({ example: 'test@gmail.com' })
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@ApiProperty({
		example: '482913',
		description: '6-digit code from the email',
	})
	@IsString()
	@IsNotEmpty()
	@Matches(/^\d{6}$/, { message: 'otp must be a 6-digit code' })
	otp: string;
}
