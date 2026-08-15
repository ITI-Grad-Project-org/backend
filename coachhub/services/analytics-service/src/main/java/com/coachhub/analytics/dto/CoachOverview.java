package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;

@Schema(
        name = "CoachOverview",
        description =
                "Everything the coach home screen shows above the fold, in one call: the roster"
                    + " counters, headline adherence, this week's training volume, and the size of"
                    + " each attention queue. The counts here are badges — GET /attention returns"
                    + " the rows behind them.")
public record CoachOverview(
        @Schema(description = "Inclusive start of the window the rates are measured over")
                LocalDate from,
        @Schema(description = "Inclusive end") LocalDate to,
        @Schema(description = "Status mix and MRR, identical to the roster report's summary")
                RosterSummary roster,
        @Schema(
                        description =
                                "Completed sessions ÷ scheduled sessions across the whole roster"
                                    + " for the window. Null when the roster had nothing scheduled.",
                        example = "92.0",
                        nullable = true)
                BigDecimal sessionAdherencePct,
        @Schema(description = "Submitted check-ins with no coach response yet", example = "3")
                long checkinsAwaitingReview,
        @Schema(
                        description =
                                "Active clients silent for longer than the risk threshold"
                                    + " (see GET /attention)",
                        example = "1")
                long clientsAtRisk,
        @Schema(description = "Client programmes whose last day falls inside the horizon", example = "2")
                long programsEndingSoon,
        @Schema(description = "Sessions logged this week against last week") SessionTrend thisWeek) {}
