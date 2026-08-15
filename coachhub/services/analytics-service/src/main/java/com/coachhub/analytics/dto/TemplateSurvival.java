package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(
        name = "TemplateSurvival",
        description = "Week-by-week retention curve for a single programme template.")
public record TemplateSurvival(
        @Schema(format = "uuid") String templateId,
        @Schema(example = "Beginner Strength 8wk") String templateName,
        @Schema(description = "Derived client programmes the curve is computed over", example = "12")
                long programsDerived,
        List<SurvivalPoint> weeks) {}
