import { SubscriptionPlan } from './enums/subscription-plan.enum';

export interface subscriptionPlanDefinition {
	plan: SubscriptionPlan;
	displayName: string;
	priceCents: number;
	currency: 'EGP';
	durationDays: number | null;
	activeClientLimit: number | null;
	aiPlanBuilderEnabled: boolean;
}

export const SUBSCRIPTION_DURATION_DAYS = 30;

export const PLAN_DEFINITIONS: Record<
	SubscriptionPlan,
	subscriptionPlanDefinition
> = {
	[SubscriptionPlan.FREE]: {
		plan: SubscriptionPlan.FREE,
		displayName: 'Free',
		priceCents: 0,
		currency: 'EGP',
		durationDays: null,
		activeClientLimit: 3,
		aiPlanBuilderEnabled: false,
	},
	[SubscriptionPlan.SOLO]: {
		plan: SubscriptionPlan.SOLO,
		displayName: 'Solo',
		priceCents: 29_900,
		currency: 'EGP',
		durationDays: SUBSCRIPTION_DURATION_DAYS,
		activeClientLimit: 20,
		aiPlanBuilderEnabled: true,
	},
	[SubscriptionPlan.STUDIO]: {
		plan: SubscriptionPlan.STUDIO,
		displayName: 'Studio',
		priceCents: 59_900,
		currency: 'EGP',
		durationDays: SUBSCRIPTION_DURATION_DAYS,
		activeClientLimit: null,
		aiPlanBuilderEnabled: true,
	},
};

export const PAID_PLANS = [SubscriptionPlan.SOLO, SubscriptionPlan.STUDIO];
