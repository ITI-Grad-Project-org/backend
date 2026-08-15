package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

@Schema(
        name = "SurvivalPoint",
        description =
                "One week of a template's retention curve. A programme 'reaches' a week if the"
                    + " client completed at least one session in that week or later, so the curve"
                    + " is monotonically non-increasing and the week it falls off a cliff is the"
                    + " week the template loses people.")
public record SurvivalPoint(
        @Schema(description = "Programme week number, 1-based", example = "3") int week,
        @Schema(description = "Derived programmes still active in this week or later", example = "7")
                long programsReaching,
        @Schema(description = "programsReaching as a share of all derived programmes", example = "58.3")
                BigDecimal retentionPct) {}
