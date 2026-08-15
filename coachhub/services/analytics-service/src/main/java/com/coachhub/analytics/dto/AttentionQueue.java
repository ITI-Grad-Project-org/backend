package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

@Schema(
        name = "AttentionQueue",
        description =
                "The three things that go stale if a coach does not act on them, each already"
                    + " sorted most-urgent-first. Kept as one call because they are read together"
                    + " as a single 'needs you now' panel, and as three lists rather than one merged"
                    + " feed because the actions differ: message, review, renew.")
public record AttentionQueue(
        @Schema(description = "The date urgency is measured from — the window's end date")
                LocalDate asOf,
        @Schema(description = "Days of silence before a client is listed", example = "7")
                int riskThresholdDays,
        @Schema(description = "How far ahead programme endings are reported", example = "14")
                int endingHorizonDays,
        @Schema(description = "Quietest client first") List<AtRiskClient> atRisk,
        @Schema(description = "Longest wait first") List<PendingCheckin> checkinsAwaitingReview,
        @Schema(description = "Soonest ending first") List<EndingProgram> programsEndingSoon) {}
