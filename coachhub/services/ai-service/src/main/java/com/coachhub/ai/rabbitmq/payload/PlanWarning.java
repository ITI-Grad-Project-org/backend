package com.coachhub.ai.rabbitmq.payload;

/**
 * One thing wrong with, or worth saying about, a generated plan.
 *
 * <p>The severity line is not a matter of taste: {@code ERROR} is for things core-api's schema would
 * reject outright — an exercise id that is not in the library, a day number outside 1-7, a set that
 * prescribes neither reps nor a duration. {@code WARNING} is for things a coach might merely
 * disagree with. That distinction is what lets core-api decide between {@code invalid} and {@code
 * ready} without re-deriving it.
 */
public record PlanWarning(String code, String severity, String path, String message) {

	private static final String ERROR = "error";
	private static final String WARNING = "warning";

	public static PlanWarning error(String code, String path, String message) {
		return new PlanWarning(code, ERROR, path, message);
	}

	public static PlanWarning warning(String code, String path, String message) {
		return new PlanWarning(code, WARNING, path, message);
	}

	public boolean isError() {
		return ERROR.equals(severity);
	}
}
