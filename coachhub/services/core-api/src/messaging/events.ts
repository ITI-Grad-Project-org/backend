import { PlanSuggestionKind } from '../common';
import {
	PlanCandidates,
	PlanInputSnapshot,
	PlanModelMeta,
	PlanSuggestionWarning,
	SuggestedPlan,
} from '../ai/types/plan-suggestion.types';

export const EVENTS_EXCHANGE = 'coachhub.events';
export const SCHEMA_VERSION = '1.0.0';

export const EventType = {
	CLIENT_INVITED: 'client.invited',
	CLIENT_REQUESTED: 'client.requested',
	CLIENT_REQUEST_APPROVED: 'client.request.approved',
	CLIENT_REQUEST_REJECTED: 'client.request.rejected',
	PLAN_ASSIGNED: 'plan.assigned',
	CHECKIN_DUE: 'checkin.due',
	CHECKIN_SUBMITTED: 'checkin.submitted',
	WORKOUT_LOGGED: 'workout.logged',
	MESSAGE_SENT: 'message.sent',
	AI_REQUESTED: 'ai.requested',
	AI_COMPLETED: 'ai.completed',
	/**
	 * Plan generation, which is a different job from the free-text `ai.requested`
	 * question: it carries a whole client context and a library to choose from,
	 * and its answer is stored rather than streamed to a socket and forgotten.
	 */
	AI_PLAN_REQUESTED: 'ai.plan.requested',
	AI_PLAN_COMPLETED: 'ai.plan.completed',
	AI_ACCEPTED: 'ai.accepted',
	AI_TIMED_OUT: 'ai.timed_out',
	/** WebSocket-only: the request was malformed. The socket stays open. */
	AI_REJECTED: 'ai.rejected',
	/** WebSocket-only: no valid token. The socket is closed straight after. */
	AI_UNAUTHORIZED: 'ai.unauthorized',
	PASSWORD_RESET: 'password.reset',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

export interface EventEnvelope<T = unknown> {
	tenantId: string;
	correlationId: string;
	messageType: EventType;
	timestamp: string;
	schemaVersion: string;
	payload: T;
}

export interface ClientInvitedPayload {
	inviteId: string;
	coachId: string;
	coachName: string;
	clientEmail: string;
	clientName: string | null;
	/** 6-digit code the client types into the app to accept the invite. */
	otp: string;
	expiresAt: string;
}

/** Client-initiated join request — notifies the coach. */
export interface ClientRequestedPayload {
	membershipId: string;
	clientId: string;
	clientName: string;
	clientEmail: string;
	coachId: string;
	coachEmail: string;
	coachName: string;
	tenantName: string;
	message: string | null;
	/** Deep link to the coach's pending-requests screen. */
	requestsUrl: string;
}

/** Coach's decision on a join request — notifies the client. */
export interface ClientRequestDecidedPayload {
	membershipId: string;
	clientId: string;
	clientEmail: string;
	clientName: string;
	coachId: string;
	coachName: string;
	tenantName: string;
	/**
	 * 6-digit code the client types into the app to activate the membership.
	 * Set on approval; null on rejection (nothing to confirm).
	 */
	otp: string | null;
	/** Where the client picks up next on rejection — browsing the directory. */
	actionUrl: string;
}

export interface PlanAssignedPayload {
	planId: string;
	planTitle: string;
	coachId: string;
	coachName: string;
	clientId: string;
	clientEmail: string;
	clientName: string;
	startsAt: string;
}

/**
 * Identity fields are nullable because the requester is either a coach or a
 * client, never both: a coach token carries `coachId`/`coachEmail` and a client
 * token carries `clientId`. The tenant lives on the envelope, not here, and it
 * is the field ai-service scopes retrieval by.
 */
export interface AiRequestedPayload {
	requestId: string;
	clientId: string | null;
	coachId: string | null;
	coachEmail: string | null;
	kind: string;
	prompt: string;
}

export interface AiCompletedPayload {
	requestId: string;
	clientId: string | null;
	coachId: string | null;
	coachEmail: string | null;
	status: 'succeeded' | 'failed';
	summary: string;
}

/**
 * Everything ai-service needs to design one plan, so that it never has to call
 * back into core-api — the two services share no synchronous path.
 *
 * `candidates` is the whole point: the model selects ids from these lists, it
 * does not invent exercises or foods, because the columns that store its answer
 * are foreign keys.
 */
export interface AiPlanRequestedPayload {
	requestId: string;
	/** The `ai_plan_suggestions` row this will fill in. */
	suggestionId: string;
	membershipId: string;
	coachId: string;
	kind: PlanSuggestionKind;
	context: PlanInputSnapshot;
	candidates: PlanCandidates;
}

export interface AiPlanCompletedPayload {
	requestId: string;
	suggestionId: string;
	membershipId: string;
	coachId: string;
	kind: PlanSuggestionKind;
	status: 'succeeded' | 'failed';
	/** The proposal, or null when `status` is `failed`. */
	plan: SuggestedPlan | null;
	/** Anything ai-service already knows is wrong with it. */
	warnings: PlanSuggestionWarning[];
	/** Why there is no plan; null on success. */
	error: string | null;
	modelMeta: PlanModelMeta | null;
}

export interface PasswordResetPayload {
	email: string;
	name: string;
	/** 6-digit code the user types into the app (web and mobile share this flow). */
	otp: string;
	expiresInMinutes: number;
}
