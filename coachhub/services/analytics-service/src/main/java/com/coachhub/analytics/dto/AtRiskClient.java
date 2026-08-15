package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;

@Schema(
        name = "AtRiskClient",
        description =
                "An active client who has gone quiet. Silence is measured from the last logged"
                    + " activity of any kind — a workout set, a meal, anything — because a client"
                    + " who is eating to plan but not lifting has not disappeared.")
public record AtRiskClient(
        @Schema(format = "uuid") String membershipId,
        @Schema(example = "Alex Rivera", nullable = true) String clientName,
        @Schema(
                        description = "Last day this client logged anything. Null if they never have.",
                        nullable = true)
                LocalDate lastActivityOn,
        @Schema(
                        description =
                                "Days of silence, counted from the last activity or, for a client"
                                    + " who has never logged, from the day they joined. Without"
                                    + " that fallback every new signup would appear here on day"
                                    + " one, which is the fastest way to make a coach stop reading"
                                    + " the list.",
                        example = "11")
                long daysSinceActivity,
        @Schema(
                        description = "True when the client has never logged anything at all",
                        example = "false")
                boolean neverActive) {}
