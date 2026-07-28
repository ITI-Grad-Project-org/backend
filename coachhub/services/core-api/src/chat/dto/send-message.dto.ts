import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
	@IsString()
	@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
	@MinLength(1, { message: 'Message body cannot be empty' })
	@MaxLength(4000)
	body: string;

	/**
	 * Optional client-generated id. Echoed back on `message:new` so the sender
	 * can reconcile the optimistic bubble it rendered before the round-trip.
	 */
	@IsOptional()
	@IsString()
	@MaxLength(64)
	clientMsgId?: string;
}
