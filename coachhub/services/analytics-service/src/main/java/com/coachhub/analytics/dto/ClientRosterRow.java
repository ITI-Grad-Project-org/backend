package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;

@Schema(
        name = "ClientRosterRow",
        description =
                "One client's line in the roster. The leaderboard and the risk list are these same"
                    + " rows read from opposite ends.")
public record ClientRosterRow(
        @Schema(format = "uuid") String membershipId,
        @Schema(example = "Alex Rivera") String clientName,
        @Schema(
                        description = "Membership status",
                        allowableValues = {
                            "invited", "requested", "active", "paused", "archived", "rejected",
                            "blocked"
                        },
                        example = "active")
                String status,
        @Schema(nullable = true) LocalDate joinedOn,
        @Schema(description = "Non-rest programme days falling in the window", example = "12")
                long scheduledSessions,
        @Schema(example = "10") long completedSessions,
        @Schema(
                        description =
                                "completedSessions ÷ scheduledSessions. Null, not zero, when"
                                    + " nothing was scheduled — a client with no programme has not"
                                    + " failed to train, and counting them as 0% would drag the"
                                    + " roster average toward a fiction.",
                        example = "83.3",
                        nullable = true)
                BigDecimal adherencePct,
        @Schema(
                        description = "Last day this client logged anything at all",
                        nullable = true)
                LocalDate lastActivityOn,
        @Schema(
                        description = "Measured to the window's end date, not to today",
                        example = "4",
                        nullable = true)
                Long daysSinceLastActivity,
        @Schema(nullable = true, example = "149.99") BigDecimal monthlyPrice,
        @Schema(example = "USD", nullable = true) String currency) {}
