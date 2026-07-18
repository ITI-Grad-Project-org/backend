import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UpdateProgramDayDto } from '../dto/workout-builder.dto';
import { PlannedExercise } from '../entities/planned-exercise.entity';
import { ProgramDay } from '../entities/program-day.entity';
import { lockEditableDay } from '../helpers/workout-builder.persistence';
import {
	assertActiveTenant,
	normalizeOptionalText,
} from '../utils/training-service.utils';

@Injectable()
export class ProgramDaysService {
	constructor(private readonly dataSource: DataSource) {}

	async updateProgramDay(
		tenantId: string | null,
		programId: string,
		programDayId: string,
		body: UpdateProgramDayDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		return this.dataSource.transaction(async (manager) => {
			const day = await lockEditableDay(
				manager,
				activeTenantId,
				programId,
				programDayId,
			);

			if (body.isRestDay === true) {
				const exerciseCount = await manager
					.getRepository(PlannedExercise)
					.count({
						where: { programDayId: day.id },
					});
				if (exerciseCount > 0) {
					throw new ConflictException(
						'Remove all planned exercises before marking this day as rest',
					);
				}
			}

			if (body.name !== undefined) {
				day.name = normalizeOptionalText(body.name);
			}
			if (body.notes !== undefined) {
				day.notes = normalizeOptionalText(body.notes);
			}
			if (body.isRestDay !== undefined) {
				day.isRestDay = body.isRestDay;
			}

			return manager.getRepository(ProgramDay).save(day);
		});
	}
}
