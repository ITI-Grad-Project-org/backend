export enum CheckinStatus {
	/** Scheduled and waiting on the client. */
	PENDING = 'pending',
	/** Client submitted; sitting in the coach's review queue. */
	SUBMITTED = 'submitted',
	/** Coach has read it and (optionally) left feedback. */
	REVIEWED = 'reviewed',
	/** The window closed with no submission. Set by the scheduler, not the client. */
	MISSED = 'missed',
}
