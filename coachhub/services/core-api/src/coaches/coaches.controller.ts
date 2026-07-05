import {
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	Param,
	ParseUUIDPipe,
	Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CoachesService } from './coaches.service';
import { UpdateCoachDto } from './dto/update-coach.dto';
import { CurrentUser } from '../auth';

@ApiTags('Coaches')
@ApiBearerAuth()
@Controller('coaches')
export class CoachesController {
	constructor(private readonly coachesService: CoachesService) {}

	@Get('me')
	@ApiOperation({ summary: 'Get my profile' })
	getMe(@CurrentUser('userId') coachId: string) {
		return this.coachesService.findOne(coachId);
	}

	@Get(':id')
	@ApiOperation({ summary: 'Get a coach by id (must be yourself)' })
	findOne(
		@CurrentUser('userId') coachId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		this.assertSelf(coachId, id);
		return this.coachesService.findOne(id);
	}

	@Patch(':id')
	@ApiOperation({ summary: 'Update my profile' })
	update(
		@CurrentUser('userId') coachId: string,
		@Param('id', ParseUUIDPipe) id: string,
		@Body() updateCoachDto: UpdateCoachDto,
	) {
		this.assertSelf(coachId, id);
		return this.coachesService.update(id, updateCoachDto);
	}

	@Delete(':id')
	@ApiOperation({ summary: 'Delete my account' })
	remove(
		@CurrentUser('userId') coachId: string,
		@Param('id', ParseUUIDPipe) id: string,
	) {
		this.assertSelf(coachId, id);
		return this.coachesService.remove(id);
	}

	private assertSelf(coachId: string, targetId: string) {
		if (coachId !== targetId) {
			throw new ForbiddenException('You can only access your own account');
		}
	}
}
