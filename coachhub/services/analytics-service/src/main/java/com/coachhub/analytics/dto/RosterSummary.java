package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.Map;

@Schema(name = "RosterSummary", description = "Portfolio-level view of a coach's roster.")
public record RosterSummary(
        @Schema(example = "24") long active,
        @Schema(example = "3") long paused,
        @Schema(description = "Coach invited them; not yet accepted", example = "2") long invited,
        @Schema(description = "Client asked to join; awaiting the coach's decision", example = "1")
                long requested,
        @Schema(example = "7") long archived,
        @Schema(
                        description =
                                "Monthly recurring revenue keyed by ISO 4217 code, counting active"
                                    + " memberships with a price set. A map rather than one total"
                                    + " because memberships carry their own currency and there is"
                                    + " no FX conversion — summing across them would invent a"
                                    + " number.",
                        example = "{\"USD\": 8400.00}")
                Map<String, BigDecimal> mrrByCurrency) {}
