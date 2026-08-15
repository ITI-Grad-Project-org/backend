package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.List;

@Schema(
        name = "ExerciseStrength",
        description =
                "A client's progression on one exercise. Grouped by the exercise name recorded on"
                    + " the logged row rather than by exercise id, so a lift keeps one continuous"
                    + " line even if the coach later swaps which library exercise it points at.")
public record ExerciseStrength(
        @Schema(example = "Back Squat") String exerciseName,
        @Schema(example = "108.33", nullable = true) BigDecimal firstE1rmKg,
        @Schema(example = "116.67", nullable = true) BigDecimal latestE1rmKg,
        @Schema(description = "Best single day in the window", example = "118.33", nullable = true)
                BigDecimal bestE1rmKg,
        @Schema(
                        description =
                                "Latest against first. Null when the window holds only one"
                                    + " training day for this exercise — one point is not a trend.",
                        example = "7.7",
                        nullable = true)
                BigDecimal changePct,
        @Schema(description = "Chronological, one entry per training day") List<StrengthPoint> points) {}
