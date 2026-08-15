package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Schema(
        name = "SessionTrend",
        description =
                "This week's training volume against last week's. The week runs Monday to Sunday"
                    + " and is derived from the window's end date, so asking for a historical"
                    + " window reports that week rather than the current one.")
public record SessionTrend(
        @Schema(description = "Monday of the reported week", example = "2026-08-10")
                LocalDate weekStart,
        @Schema(description = "Sunday of the reported week", example = "2026-08-16")
                LocalDate weekEnd,
        @Schema(example = "112") long sessionsLogged,
        @Schema(description = "Same count for the seven days before weekStart", example = "98")
                long previousWeekSessions,
        @Schema(
                        description =
                                "Change against the previous week. Null, not zero, when the"
                                    + " previous week had no sessions — there is no percentage"
                                    + " change from nothing, and rendering that as 0% would read as"
                                    + " 'flat' when it is actually 'new'.",
                        example = "14.3",
                        nullable = true)
                BigDecimal changePct,
        @Schema(description = "Seven rows, Monday first") List<DayCount> byDay) {}
