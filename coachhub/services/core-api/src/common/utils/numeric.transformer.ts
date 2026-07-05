import { ValueTransformer } from 'typeorm';

/**
 * Postgres `numeric` columns come back from the driver as strings; this keeps
 * the entity property a `number` in both directions.
 */
export class NumericTransformer implements ValueTransformer {
	to(value?: number | null): number | null | undefined {
		return value;
	}

	from(value?: string | null): number | null {
		if (value === null || value === undefined) {
			return null;
		}

		return parseFloat(value);
	}
}

export const numericTransformer = new NumericTransformer();
