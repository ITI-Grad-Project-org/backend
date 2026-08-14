package com.coachhub.analytics.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One client's line in the roster table — the leaderboard and the risk list are
 * the same rows sorted differently.
 *
 * @param adherencePct null, not zero, when nothing was scheduled in the window.
 *     A client with no programme assigned has not failed to train, and folding
 *     them in as 0% would drag the roster average toward a fiction.
 * @param daysSinceLastActivity null when the client has never logged anything.
 */
public record ClientRosterRow(
        String membershipId,
        String clientName,
        String status,
        LocalDate joinedOn,
        long scheduledSessions,
        long completedSessions,
        BigDecimal adherencePct,
        LocalDate lastActivityOn,
        Long daysSinceLastActivity,
        BigDecimal monthlyPrice,
        String currency) {}
