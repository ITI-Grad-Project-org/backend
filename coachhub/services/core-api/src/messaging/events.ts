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
} as const;

export type EventType = ( typeof EventType )[keyof typeof EventType];

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