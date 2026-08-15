package com.coachhub.analytics.repository;

/**
 * SQL shared by more than one repository.
 *
 * <p>These are string fragments rather than views because analytics holds SELECT and nothing else
 * on core_db — it cannot create a view in a schema core-api owns, and asking core-api to carry a
 * view for analytics' benefit would put a reporting concern in the write model.
 */
final class SqlFragments {

	/**
	 * The calendar date a programme day falls on.
	 *
	 * <p>Programme structure is relative — week 1..N, day 1..7 — and only {@code programs.start_date}
	 * anchors it to the calendar. There is no scheduled-date column to read, so any query that asks
	 * "what was due in this window" has to derive it. Rest days are excluded by the caller, not here,
	 * because "scheduled" means something different to adherence (sessions owed) than it does to a
	 * calendar (days planned).
	 */
	static final String SCHEDULED_DATE =
					"(p.start_date + ((w.week_number - 1) * 7 + (d.day_number - 1)))";

	/**
	 * The last day a programme covers.
	 *
	 * <p>{@code ck_programs_client_template_shape} already guarantees {@code end_date} is set on
	 * every client programme, so the fallback should never fire. It is here because this query
	 * decides whether a coach is told their client's plan is about to run out: if that constraint is
	 * ever relaxed, a silently-null end date would drop clients out of the renewal queue rather than
	 * fail, and nobody would notice until renewals started being missed.
	 *
	 * <p>A programme of N weeks starting on day D ends on D + 7N - 1 — the minus one keeps the start
	 * day inside the count, so a 4-week programme spans 28 days rather than 29.
	 */
	static final String DERIVED_END_DATE =
					"coalesce(p.end_date, p.start_date + (p.duration_weeks * 7 - 1))";

	/** Non-empty display name for a client, falling back to null rather than a blank string. */
	static final String CLIENT_NAME =
					"nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '')";

	private SqlFragments() {}
}
