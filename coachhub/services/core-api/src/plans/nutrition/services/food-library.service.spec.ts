import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FoodLibraryService } from './food-library.service';

describe('FoodLibraryService search', () => {
	let queryBuilder: {
		where: jest.Mock;
		andWhere: jest.Mock;
		orderBy: jest.Mock;
		addOrderBy: jest.Mock;
		getMany: jest.Mock;
	};
	let service: FoodLibraryService;

	beforeEach(() => {
		queryBuilder = {
			where: jest.fn(),
			andWhere: jest.fn(),
			orderBy: jest.fn(),
			addOrderBy: jest.fn(),
			getMany: jest.fn(async () => []),
		};
		queryBuilder.where.mockReturnValue(queryBuilder);
		queryBuilder.andWhere.mockReturnValue(queryBuilder);
		queryBuilder.orderBy.mockReturnValue(queryBuilder);
		queryBuilder.addOrderBy.mockReturnValue(queryBuilder);

		service = new FoodLibraryService({
			createQueryBuilder: jest.fn(() => queryBuilder),
		} as never);
	});

	it('escapes SQL wildcard characters for literal matching', async () => {
		await service.findFoods('tenant-id', {
			search: '  50%_off\\today  ',
		});

		expect(queryBuilder.andWhere).toHaveBeenCalledWith(
			"(food.name ILIKE :search ESCAPE '\\' OR COALESCE(food.brand, '') ILIKE :search ESCAPE '\\')",
			{ search: '%50\\%\\_off\\\\today%' },
		);
	});

	it('treats a whitespace-only search as no search filter', async () => {
		await service.findFoods('tenant-id', { search: '   ' });

		expect(queryBuilder.andWhere).toHaveBeenCalledTimes(1);
		expect(queryBuilder.andWhere).toHaveBeenCalledWith('food.is_active = true');
	});
});
