export const EVENTS_EXCHANGE = 'coachhub.events';
export const SCHEMA_VERSION = '1.0.0';

export const EventType = {
	CLIENT_INVITED: 'client.invited',
	PLAN_ASSIGNED: 'plan.assigned',
	CHECKIN_DUE: 'checkin.due',
	CHECKIN_SUBMITTED: 'checkin.submitted',
	WORKOUT_LOGGED: 'workout.logged',
	MESSAGE_SENT: 'message.sent',
	AI_REQUESTED: 'ai.requested',
	AI_COMPLETED: 'ai.completed',
	AI_ACCEPTED: 'ai.accepted',
	AI_TIMED_OUT: 'ai.timed_out',
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
