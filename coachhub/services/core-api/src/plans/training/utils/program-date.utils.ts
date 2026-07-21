// Compatibility re-export for the training feature. Date-only arithmetic is
// shared with nutrition so both client-first plan types follow identical rules.
export {
	addDaysToDateOnly,
	deriveInclusiveEndDate,
	getDateOnlyInTimeZone,
	getScheduledDate,
	isValidDateOnly,
} from '../../../common/utils/date-only.utils';
