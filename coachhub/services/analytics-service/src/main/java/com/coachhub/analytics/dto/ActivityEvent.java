package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Schema(
        name = "ActivityEvent",
        description =
                "One line in the activity feed. Rows are removed when a client un-logs the thing"
                    + " that created them, so the feed reflects what a client currently claims to"
                    + " have done rather than an audit trail of what they once claimed.")
public record ActivityEvent(
        @Schema(format = "uuid") String membershipId,
        @Schema(example = "Alex Rivera", nullable = true) String clientName,
        @Schema(
                        description = "What the client logged",
                        allowableValues = {
                            "workout_set_reported",
                            "nutrition_meal_reported",
                            "nutrition_flexible_meal_logged"
                        },
                        example = "workout_set_reported")
                String activityType,
        @Schema(
                        description =
                                "The day this counted for in the client's own timezone, which is"
                                    + " what the streak graph is drawn from. It can differ from"
                                    + " occurredAt's date by a day for clients training either side"
                                    + " of midnight or in another timezone from their coach.",
                        example = "2026-08-14")
                LocalDate activityDate,
        @Schema(description = "The instant it happened, in UTC") OffsetDateTime occurredAt) {}
