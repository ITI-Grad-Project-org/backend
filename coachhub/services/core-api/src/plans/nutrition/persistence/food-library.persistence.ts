import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { QueryFoodsDto } from '../dto/query-foods.dto';
import { Food } from '../entities/food.entity';
import { normalizeFoodLookupText } from '../utils/food-library.utils';

export const DUPLICATE_FOOD_MESSAGE =
	'A Food with this name and brand already exists';

export function findTenantFoods(
	foodRepository: Repository<Food>,
	tenantId: string,
	filters: QueryFoodsDto,
) {
	const query = foodRepository
		.createQueryBuilder('food')
		.where('food.tenant_id = :tenantId', { tenantId });

	if (!filters.includeInactive) {
		query.andWhere('food.is_active = true');
	}

	if (filters.search?.trim()) {
		query.andWhere(
			"(food.name ILIKE :search OR COALESCE(food.brand, '') ILIKE :search)",
			{ search: `%${filters.search.trim()}%` },
		);
	}

	if (filters.servingUnit) {
		query.andWhere('food.serving_unit = :servingUnit', {
			servingUnit: filters.servingUnit,
		});
	}

	if (filters.dietaryTag) {
		query.andWhere(':dietaryTag = ANY(food.dietary_tags)', {
			dietaryTag: filters.dietaryTag,
		});
	}

	if (filters.allergen?.trim()) {
		query.andWhere(':allergen = ANY(food.allergens)', {
			allergen: normalizeFoodLookupText(filters.allergen),
		});
	}

	return query
		.orderBy('LOWER(food.name)', 'ASC')
		.addOrderBy("LOWER(COALESCE(food.brand, ''))", 'ASC')
		.addOrderBy('food.id', 'ASC')
		.getMany();
}

export async function assertFoodIdentityAvailable(
	foodRepository: Repository<Food>,
	tenantId: string,
	name: string,
	brand: string | null,
	excludeFoodId?: string,
) {
	const query = foodRepository
		.createQueryBuilder('food')
		.where('food.tenant_id = :tenantId', { tenantId })
		.andWhere('LOWER(food.name) = :name', {
			name: normalizeFoodLookupText(name),
		})
		.andWhere("COALESCE(LOWER(food.brand), '') = :brand", {
			brand: normalizeFoodLookupText(brand),
		});

	if (excludeFoodId) {
		query.andWhere('food.id != :excludeFoodId', { excludeFoodId });
	}

	if (await query.getOne()) {
		throw new ConflictException(DUPLICATE_FOOD_MESSAGE);
	}
}

export async function findTenantFoodOrFail(
	foodRepository: Repository<Food>,
	tenantId: string,
	foodId: string,
) {
	const food = await foodRepository.findOne({
		where: {
			id: foodId,
			tenantId,
		},
	});

	if (!food) {
		throw new NotFoundException('Food not found');
	}

	return food;
}

export function throwFoodConflictForUniqueViolation(error: unknown) {
	if (
		error instanceof QueryFailedError &&
		(error.driverError as { code?: string } | undefined)?.code === '23505'
	) {
		throw new ConflictException(DUPLICATE_FOOD_MESSAGE);
	}
}
