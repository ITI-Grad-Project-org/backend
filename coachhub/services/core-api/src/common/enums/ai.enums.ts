/** What an AI suggestion proposes. Decides which table accepting it writes to. */
export enum PlanSuggestionKind {
	TRAINING = 'training',
	NUTRITION = 'nutrition',
}

/**
 * Where a suggestion is in its life.
 *
 * `INVALID` and `FAILED` differ in whose fault it was, and both are shown to the
 * coach rather than retried silently: `INVALID` means the model answered but the
 * plan breaks a database constraint or names an exercise this tenant does not
 * have, `FAILED` means no usable answer came back at all. Only `READY` can be
 * accepted.
 */
export enum PlanSuggestionStatus {
	PENDING = 'pending',
	READY = 'ready',
	INVALID = 'invalid',
	FAILED = 'failed',
	ACCEPTED = 'accepted',
	DECLINED = 'declined',
}
