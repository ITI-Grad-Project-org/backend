package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;
import java.math.BigDecimal;
import java.time.LocalDate;

@Schema(
        name = "EndingProgram",
        description =
                "A client programme running out. This is the renewal prompt: a client whose plan"
                    + " ends with nothing queued behind it is a client who stops training, and the"
                    + " window to write the next block is before the last one lapses, not after.")
public record EndingProgram(
        @Schema(format = "uuid") String programId,
        @Schema(format = "uuid") String membershipId,
        @Schema(example = "Alex Rivera", nullable = true) String clientName,
        @Schema(example = "12-Week Hypertrophy") String programName,
        @Schema(
                        description =
                                "The programme's own end_date when set, otherwise derived from"
                                    + " start_date and duration_weeks",
                        requiredMode = RequiredMode.REQUIRED)
                LocalDate endsOn,
        @Schema(
                        description = "Days until the last day, counted from the window's end date."
                                + " Zero means it ends today; negative values are not returned.",
                        example = "5")
                long daysRemaining,
        @Schema(
                        description =
                                "Completed sessions ÷ scheduled sessions for this programme's whole"
                                    + " run, so the coach can tell a finishing client from a stalled"
                                    + " one before deciding what comes next. Null when nothing was"
                                    + " scheduled.",
                        example = "88.9",
                        nullable = true)
                BigDecimal completionPct) {}
