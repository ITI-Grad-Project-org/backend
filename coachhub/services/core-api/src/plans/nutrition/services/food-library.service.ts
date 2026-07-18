import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateFoodDto } from '../dto/create-food.dto';
import { QueryFoodsDto } from '../dto/query-foods.dto';
import { UpdateFoodDto } from '../dto/update-food.dto';
import { Food } from '../entities/food.entity';
import {
	assertFoodIdentityAvailable,
	findTenantFoodOrFail,
	throwFoodConflictForUniqueViolation,
} from '../helpers/food-library.persistence';
import {
	assertActiveTenant,
	normalizeFoodAllergens,
	normalizeFoodDietaryTags,
	normalizeFoodDisplayText,
	normalizeFoodLookupText,
	normalizeNullableFoodDisplayText,
} from '../utils/food-library.utils';

@Injectable()
export class FoodLibraryService {
	constructor(
		@InjectRepository(Food)
		private readonly foodRepository: Repository<Food>,
	) {}

	async createFood(
		tenantId: string | null,
		coachId: string,
		body: CreateFoodDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		const name = normalizeFoodDisplayText(body.name);
		const brand = normalizeNullableFoodDisplayText(body.brand);
		await assertFoodIdentityAvailable(
			this.foodRepository,
			activeTenantId,
			name,
			brand,
		);

		const food = this.foodRepository.create({
			tenantId: activeTenantId,
			createdBy: { id: coachId },
			name,
			brand,
			servingSize: body.servingSize,
			servingUnit: body.servingUnit,
			calories: body.calories,
			proteinG: body.proteinG,
			carbsG: body.carbsG,
			fatG: body.fatG,
			fiberG: body.fiberG ?? null,
			dietaryTags: normalizeFoodDietaryTags(body.dietaryTags),
			allergens: normalizeFoodAllergens(body.allergens),
			isActive: true,
		});

		try {
			return await this.foodRepository.save(food);
		} catch (error) {
			throwFoodConflictForUniqueViolation(error);
			throw error;
		}
	}

	async findFoods(tenantId: string | null, query: QueryFoodsDto) {
		const activeTenantId = assertActiveTenant(tenantId);
		const foodsQuery = this.foodRepository
			.createQueryBuilder('food')
			.where('food.tenant_id = :tenantId', { tenantId: activeTenantId });

		if (!query.includeInactive) {
			foodsQuery.andWhere('food.is_active = true');
		}

		if (query.search?.trim()) {
			foodsQuery.andWhere(
				"(food.name ILIKE :search OR COALESCE(food.brand, '') ILIKE :search)",
				{ search: `%${query.search.trim()}%` },
			);
		}

		if (query.servingUnit) {
			foodsQuery.andWhere('food.serving_unit = :servingUnit', {
				servingUnit: query.servingUnit,
			});
		}

		if (query.dietaryTag) {
			foodsQuery.andWhere(':dietaryTag = ANY(food.dietary_tags)', {
				dietaryTag: query.dietaryTag,
			});
		}

		if (query.allergen?.trim()) {
			foodsQuery.andWhere(':allergen = ANY(food.allergens)', {
				allergen: normalizeFoodLookupText(query.allergen),
			});
		}

		return foodsQuery
			.orderBy('LOWER(food.name)', 'ASC')
			.addOrderBy("LOWER(COALESCE(food.brand, ''))", 'ASC')
			.addOrderBy('food.id', 'ASC')
			.getMany();
	}

	async findFood(tenantId: string | null, foodId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		return findTenantFoodOrFail(this.foodRepository, activeTenantId, foodId);
	}

	async updateFood(
		tenantId: string | null,
		foodId: string,
		body: UpdateFoodDto,
	) {
		const activeTenantId = assertActiveTenant(tenantId);
		const food = await findTenantFoodOrFail(
			this.foodRepository,
			activeTenantId,
			foodId,
		);
		const nextName =
			body.name !== undefined ? normalizeFoodDisplayText(body.name) : food.name;
		const nextBrand =
			body.brand !== undefined
				? normalizeNullableFoodDisplayText(body.brand)
				: food.brand;

		if (
			normalizeFoodLookupText(nextName) !==
				normalizeFoodLookupText(food.name) ||
			normalizeFoodLookupText(nextBrand) !== normalizeFoodLookupText(food.brand)
		) {
			await assertFoodIdentityAvailable(
				this.foodRepository,
				activeTenantId,
				nextName,
				nextBrand,
				food.id,
			);
		}

		food.name = nextName;
		food.brand = nextBrand;
		if (body.servingSize !== undefined) food.servingSize = body.servingSize;
		if (body.servingUnit !== undefined) food.servingUnit = body.servingUnit;
		if (body.calories !== undefined) food.calories = body.calories;
		if (body.proteinG !== undefined) food.proteinG = body.proteinG;
		if (body.carbsG !== undefined) food.carbsG = body.carbsG;
		if (body.fatG !== undefined) food.fatG = body.fatG;
		if (body.fiberG !== undefined) food.fiberG = body.fiberG;
		if (body.dietaryTags !== undefined) {
			food.dietaryTags = normalizeFoodDietaryTags(body.dietaryTags);
		}
		if (body.allergens !== undefined) {
			food.allergens = normalizeFoodAllergens(body.allergens);
		}
		if (body.isActive !== undefined) food.isActive = body.isActive;

		try {
			return await this.foodRepository.save(food);
		} catch (error) {
			throwFoodConflictForUniqueViolation(error);
			throw error;
		}
	}

	async archiveFood(tenantId: string | null, foodId: string) {
		const activeTenantId = assertActiveTenant(tenantId);
		const food = await findTenantFoodOrFail(
			this.foodRepository,
			activeTenantId,
			foodId,
		);
		food.isActive = false;
		await this.foodRepository.save(food);
		return { message: 'Food archived' };
	}
}
