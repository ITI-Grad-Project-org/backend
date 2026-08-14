package com.coachhub.analytics.dto;

import java.math.BigDecimal;
import java.util.Map;

/**
 * Portfolio-level view of a coach's roster.
 *
 * @param mrrByCurrency monthly recurring revenue keyed by ISO 4217 code. A map
 *                      rather than a single total because memberships carry their own currency
 *                      and there is no FX conversion — summing across them would invent a number.
 */
public record RosterSummary(
				long active,
				long paused,
				long invited,
				long requested,
				long archived,
				Map<String, BigDecimal> mrrByCurrency) {}


