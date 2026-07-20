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
	AI_ACCEPTED: 'ai.accepted',
	AI_TIMED_OUT: 'ai.timed_out',
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
	inviteToken: string;
	acceptUrl: string;
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
	/** Where the client picks up next: their plan on approval, browsing on rejection. */
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

export interface AiRequestedPayload {
	requestId: string;
	clientId: string;
	coachId: string;
	coachEmail: string;
	kind: string;
	prompt: string;
}

export interface AiCompletedPayload {
	requestId: string;
	clientId: string;
	coachId: string;
	coachEmail: string;
	status: 'succeeded' | 'failed';
	summary: string;
}

export interface PasswordResetPayload {
	email: string;
	name: string;
	/** 6-digit code the user types into the app (web and mobile share this flow). */
	otp: string;
	expiresInMinutes: number;
}
