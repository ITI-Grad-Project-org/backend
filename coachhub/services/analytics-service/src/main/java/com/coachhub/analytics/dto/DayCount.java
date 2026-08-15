package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

@Schema(
        name = "DayCount",
        description =
                "Sessions completed on one calendar day. Emitted for every day in the week"
                    + " including empty ones, so the bar chart has a bar per weekday without the"
                    + " client filling gaps.")
public record DayCount(
        @Schema(example = "2026-08-10") LocalDate date,
        @Schema(
                        description = "ISO-8601 day of week: 1 = Monday through 7 = Sunday",
                        example = "1",
                        minimum = "1",
                        maximum = "7")
                int dayOfWeek,
        @Schema(example = "18") long sessions) {}
