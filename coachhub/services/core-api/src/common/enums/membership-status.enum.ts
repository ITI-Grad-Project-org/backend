export enum MembershipStatus {
	/** Coach reached out first and the client has not accepted yet. */
	INVITED = 'invited',
	/** Client asked to train with the coach and is awaiting a decision. */
	REQUESTED = 'requested',
	ACTIVE = 'active',
	PAUSED = 'paused',
	ARCHIVED = 'archived',
	/** Coach turned down a request. The client may ask again. */
	REJECTED = 'rejected',
	BLOCKED = 'blocked',
}
