package com.coachhub.ai.service.rag.ingest;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Turns database values into the kind of sentence an embedding model can actually place.
 *
 * <p>This matters more than it looks. Embeddings are computed over the text as written, so a chunk
 * that reads {@code primary_muscle=LATS, equipment={PULL_UP_BAR}} sits nowhere near a coach asking
 * "what can my client do for their back at home" — while "Primarily works the lats. Equipment
 * needed: pull up bar." sits close to it. Rendering is not cosmetic here; it is the difference
 * between a chunk being retrievable and being dead weight in the index.
 */
final class Phrasing {

	private Phrasing() {}

	/** {@code PULL_UP_BAR} → {@code pull up bar}. */
	static String humanize(String enumValue) {
		if (enumValue == null || enumValue.isBlank()) {
			return "";
		}
		return enumValue.trim().toLowerCase().replace('_', ' ');
	}

	/** A JDBC {@code text[]} / enum array as a readable list, or "" when empty. */
	static String humanizeAll(String[] values) {
		if (values == null || values.length == 0) {
			return "";
		}
		return Arrays.stream(values)
		             .filter(v -> v != null && !v.isBlank())
		             .map(Phrasing::humanize)
		             .collect(Collectors.joining(", "));
	}

	/** Verbatim list — for free text (allergies, injuries) that must not be case-folded. */
	static String joinRaw(String[] values) {
		if (values == null || values.length == 0) {
			return "";
		}
		return Arrays.stream(values)
		             .filter(v -> v != null && !v.isBlank())
		             .map(String::trim)
		             .collect(Collectors.joining(", "));
	}

	/** Ordered steps as "1) … 2) …" so the model can quote them back in order. */
	static String numbered(String[] steps) {
		if (steps == null || steps.length == 0) {
			return "";
		}
		List<String> clean =
						Arrays.stream(steps).filter(s -> s != null && !s.isBlank()).map(String::trim).toList();
		if (clean.isEmpty()) {
			return "";
		}
		StringBuilder sb = new StringBuilder();
		for (int i = 0; i < clean.size(); i++) {
			if (i > 0) {
				sb.append(' ');
			}
			sb.append(i + 1).append(") ").append(clean.get(i));
		}
		return sb.toString();
	}

	/** Appends "{label}: {value}." only when there is a value — no empty fields in the corpus. */
	static void appendIfPresent(StringBuilder sb, String label, String value) {
		if (value != null && !value.isBlank()) {
			sb.append(label).append(": ").append(value.trim()).append(".\n");
		}
	}

	/** Trailing zeros make numbers read like machine output; 12.50 → 12.5, 100.00 → 100. */
	static String number(BigDecimal value) {
		if (value == null) {
			return "";
		}
		return value.stripTrailingZeros().toPlainString();
	}
}
