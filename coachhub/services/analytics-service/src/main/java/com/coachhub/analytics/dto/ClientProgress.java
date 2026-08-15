package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

@Schema(
        name = "ClientProgress",
        description =
                "One client's outcomes over a window: is the body changing, and are the lifts"
                    + " going up. The rest of the analytics surface measures compliance — whether"
                    + " the work got done. This measures whether the work worked, which is the"
                    + " question a client actually asks.")
public record ClientProgress(
        @Schema(format = "uuid") String membershipId,
        @Schema(example = "Alex Rivera", nullable = true) String clientName,
        @Schema LocalDate from,
        @Schema LocalDate to,
        @Schema(description = "Chronological") List<MeasurementPoint> measurements,
        @Schema(
                        description =
                                "Most-trained exercise first, so the lifts the programme is built"
                                    + " around lead")
                List<ExerciseStrength> strength) {}
