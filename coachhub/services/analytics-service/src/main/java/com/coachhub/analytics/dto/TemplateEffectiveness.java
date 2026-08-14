package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

@Schema(
        name = "TemplateEffectiveness",
        description =
                "How one programme template performs once it is assigned to real clients. "
                    + "Rows exist only for templates that have been used at least once.")
public record TemplateEffectiveness(
        @Schema(description = "The template programme's id", format = "uuid") String templateId,
        @Schema(example = "Beginner Strength 8wk") String templateName,
        @Schema(description = "Client programmes created from this template", example = "12")
                long programsDerived,
        @Schema(description = "Distinct clients who have run it", example = "9") long clients,
        @Schema(description = "Non-rest days across every derived programme", example = "240")
                long scheduledSessions,
        @Schema(example = "186") long completedSessions,
        @Schema(
                        description = "completedSessions ÷ scheduledSessions. Null if nothing scheduled.",
                        example = "77.5",
                        nullable = true)
                BigDecimal completionPct,
        @Schema(
                        description =
                                "Mean of the last programme week in which each client completed a"
                                    + " session. Read against durationWeeks: a mean of 3.1 on an"
                                    + " 8-week template is where clients are dropping out.",
                        example = "5.4",
                        nullable = true)
                BigDecimal avgLastActiveWeek,
        @Schema(description = "The template's own planned length", example = "8")
                Integer durationWeeks) {}
