import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
	@ApiProperty({
		example: 'a3f1…',
		description: 'Single-use ticket returned by /verify-reset-otp',
	})
	@IsString()
	@IsNotEmpty()
	resetToken: string;

	@ApiProperty({ example: 'newSecurePassword123', minLength: 8 })
	@IsString()
	@IsNotEmpty()
	@MinLength(8)
	newPassword: string;
}
