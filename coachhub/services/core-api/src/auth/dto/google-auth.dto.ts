import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleAuthDto {
	@ApiProperty({
		description:
			'Google ID token (JWT) obtained from the Google Sign-In SDK on the client',
		example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmNDA0Y...',
	})
	@IsString()
	@IsNotEmpty()
	idToken: string;
}
