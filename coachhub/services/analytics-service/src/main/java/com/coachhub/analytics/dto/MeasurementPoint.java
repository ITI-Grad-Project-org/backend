package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;

@Schema(
        name = "MeasurementPoint",
        description =
                "One body-measurement entry. Every field except the date is nullable and they are"
                    + " reported exactly as recorded: clients fill in different subsets on"
                    + " different days, and carrying a previous value forward would draw a flat"
                    + " line through days nobody measured.")
public record MeasurementPoint(
        @Schema(example = "2026-08-14") LocalDate measuredOn,
        @Schema(example = "82.40", nullable = true) BigDecimal weightKg,
        @Schema(example = "18.2", nullable = true) BigDecimal bodyFatPct,
        @Schema(nullable = true) BigDecimal chestCm,
        @Schema(nullable = true) BigDecimal waistCm,
        @Schema(nullable = true) BigDecimal hipsCm,
        @Schema(nullable = true) BigDecimal armCm,
        @Schema(nullable = true) BigDecimal thighCm) {}
