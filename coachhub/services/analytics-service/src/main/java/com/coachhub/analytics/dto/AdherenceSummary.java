package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

@Schema(
        name = "AdherenceSummary",
        description =
                "Adherence measured against the prescription rather than app engagement. Session"
                    + " completion answers 'did they turn up'; volume adherence answers 'did they"
                    + " do the work'.")
public record AdherenceSummary(
        @Schema(
                        description =
                                "Non-rest programme days scheduled in the window. The denominator"
                                    + " is the plan, not the logs — sessions a client never opened"
                                    + " still count against them.",
                        example = "20")
                long scheduledSessions,
        @Schema(example = "17") long completedSessions,
        @Schema(example = "1") long partialSessions,
        @Schema(example = "2") long skippedSessions,
        @Schema(description = "Started and never finished", example = "0") long inProgressSessions,
        @Schema(example = "85.0", nullable = true) BigDecimal sessionCompletionPct,
        @Schema(
                        description =
                                "Logged sets carrying both a prescribed weight and a rep floor."
                                    + " Sets prescribed by RPE or %1RM have no absolute target and"
                                    + " are excluded, as are extra sets. Published so the volume"
                                    + " ratio can be read with its coverage.",
                        example = "184")
                long comparableSets,
        @Schema(description = "Σ prescribed_reps_min × prescribed_weight_kg", example = "2400.00")
                BigDecimal prescribedVolume,
        @Schema(description = "Σ actual reps × weight over the same sets", example = "2280.00")
                BigDecimal actualVolume,
        @Schema(
                        description =
                                "actualVolume ÷ prescribedVolume. Can exceed 100 when clients"
                                    + " out-perform the prescription. Null when comparableSets is"
                                    + " 0.",
                        example = "95.0",
                        nullable = true)
                BigDecimal volumeAdherencePct,
        @Schema(example = "160") long setsCompleted,
        @Schema(example = "12") long setsPartial,
        @Schema(example = "12") long setsSkipped,
        @Schema(description = "Unprescribed sets the client added themselves", example = "6")
                long setsExtra) {}
