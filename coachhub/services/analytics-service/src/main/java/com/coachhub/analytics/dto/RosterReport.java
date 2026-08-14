package com.coachhub.analytics.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * @param from inclusive start of the window every session figure is counted over
 * @param to inclusive end, and the reference date for "days since last activity"
 */
public record RosterReport(
        LocalDate from, LocalDate to, RosterSummary summary, List<ClientRosterRow> clients) {}
