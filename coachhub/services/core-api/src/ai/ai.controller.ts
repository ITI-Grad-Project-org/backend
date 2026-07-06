import { Controller } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
	constructor(private readonly aiService: AiService) {}

	// @Post()
	// async request ( @Body() body: { kind: string; prompt: string } ) {
	// 	return this.aiService.requestAi( {
	// 		tenantId: '00000000-0000-0000-0000-000000000000',
	// 		clientId: '22222222-2222-2222-2222-222222222222',
	// 		coachId: '11111111-1111-1111-1111-111111111111',
	// 		coachEmail: 'coach@example.com',
	// 		kind: body.kind,
	// 		prompt: body.prompt,
	// 	} );
	// }
}
