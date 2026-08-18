/**
 * Raised when a plan points at library rows that are no longer there.
 *
 * Not an HTTP exception on purpose. It is thrown from inside the acceptance
 * transaction, which has to roll back before anything can be written about it —
 * including the record of why it failed. The caller catches this outside the
 * transaction, marks the suggestion invalid, and only then turns it into a 409.
 */
export class StalePlanReferencesError extends Error {
	constructor(
		readonly kind: 'exercise' | 'meal',
		readonly ids: string[],
	) {
		super(
			`${ids.length} ${kind}${ids.length === 1 ? '' : 's'} in this plan no longer ` +
				`${ids.length === 1 ? 'exists' : 'exist'} in the library`,
		);
		this.name = 'StalePlanReferencesError';
	}
}
