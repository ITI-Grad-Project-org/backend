/**
 * The client plan list currently supports no query parameters. Keeping an
 * explicit DTO lets the global whitelist reject misspelled or unsupported
 * parameters instead of silently ignoring them.
 */
export class ClientNutritionPlanListQueryDto {}
