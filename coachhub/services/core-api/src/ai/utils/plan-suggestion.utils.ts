import { AiPlanSuggestion } from '../entities/ai-plan-suggestion.entity';
import {
	PlanConstraints,
	PlanLibraryDescriptor,
	PlanSuggestionWarning,
} from '../types/plan-suggestion.types';

/**
 * How many things are wrong, split by whether they block acceptance.
 *
 * The list shows counts and the detail shows the warnings themselves. A coach
 * scanning six suggestions wants to know which one needs reading, not to read
 * all six.
 */
export interface PlanWarningCounts {
	error: number;
	warning: number;
}

export interface PlanSuggestionSummary {
	id: string;
	requestId: string;
	membershipId: string;
	kind: string;
	status: string;
	/** What was asked for, as resolved at generation. Null on very old rows. */
	constraints: PlanConstraints | null;
	library: PlanLibraryDescriptor | null;
	warningCounts: PlanWarningCounts;
	error: string | null;
	createdProgramId: string | null;
	createdPlanId: string | null;
	declineReason: string | null;
	createdAt: Date;
	decidedAt: Date | null;
}

export interface PlanSuggestionDetail extends PlanSuggestionSummary {
	/** Everything the model was told about the client. */
	input: AiPlanSuggestion['inputSnapshot'];
	/** Null until generation answers, and on a failure. */
	plan: AiPlanSuggestion['plan'];
	warnings: PlanSuggestionWarning[];
	modelMeta: AiPlanSuggestion['modelMeta'];
}

export function countWarnings(
	warnings: PlanSuggestionWarning[] | null | undefined,
): PlanWarningCounts {
	const counts: PlanWarningCounts = { error: 0, warning: 0 };
	for (const warning of warnings ?? []) {
		if (warning?.severity === 'warning') {
			counts.warning += 1;
		} else if (warning?.severity === 'error') {
			counts.error += 1;
		}
	}
	return counts;
}

export function mapPlanSuggestionSummary(
	suggestion: AiPlanSuggestion,
): PlanSuggestionSummary {
	const snapshot = suggestion.inputSnapshot;
	return {
		id: suggestion.id,
		requestId: suggestion.requestId,
		membershipId: suggestion.membershipId,
		kind: suggestion.kind,
		status: suggestion.status,
		constraints: snapshot?.constraints ?? null,
		library: snapshot?.library ?? null,
		warningCounts: countWarnings(suggestion.warnings),
		error: suggestion.error,
		createdProgramId: suggestion.createdProgramId,
		createdPlanId: suggestion.createdPlanId,
		declineReason: suggestion.declineReason,
		createdAt: suggestion.createdAt,
		decidedAt: suggestion.decidedAt,
	};
}

export function mapPlanSuggestionDetail(
	suggestion: AiPlanSuggestion,
): PlanSuggestionDetail {
	return {
		...mapPlanSuggestionSummary(suggestion),
		input: suggestion.inputSnapshot,
		plan: suggestion.plan,
		warnings: suggestion.warnings ?? [],
		modelMeta: suggestion.modelMeta,
	};
}
