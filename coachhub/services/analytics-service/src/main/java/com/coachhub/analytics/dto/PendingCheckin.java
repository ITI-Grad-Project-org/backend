package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.time.OffsetDateTime;

@Schema(
        name = "PendingCheckin",
        description =
                "A check-in the client has submitted and the coach has not answered. Oldest first:"
                    + " this is a work queue, and the client who has waited longest is the one"
                    + " about to give up on being answered.")
public record PendingCheckin(
        @Schema(format = "uuid") String checkinId,
        @Schema(format = "uuid") String membershipId,
        @Schema(example = "Alex Rivera", nullable = true) String clientName,
        @Schema(description = "The period this check-in covers") LocalDate scheduledFor,
        @Schema(description = "When the client submitted it") OffsetDateTime submittedAt,
        @Schema(description = "Whole days waiting for a response", example = "3") long daysWaiting) {}
