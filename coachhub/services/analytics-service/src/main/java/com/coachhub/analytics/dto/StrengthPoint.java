package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;

@Schema(
        name = "StrengthPoint",
        description = "One training day's best effort on a single exercise.")
public record StrengthPoint(
        @Schema(example = "2026-08-14") LocalDate date,
        @Schema(
                        description =
                                "Best estimated one-rep max that day, by the Epley formula"
                                    + " weight x (1 + reps / 30). An estimate, not a tested max:"
                                    + " it lets a 5x100kg day and an 8x90kg day sit on the same"
                                    + " axis, which is the only way a progression line means"
                                    + " anything when the prescription changes.",
                        example = "116.67")
                BigDecimal bestE1rmKg,
        @Schema(description = "Working sets counted that day", example = "4") long sets,
        @Schema(
                        description = "Sum of reps x weight across those sets",
                        example = "1840.00")
                BigDecimal volumeKg) {}
