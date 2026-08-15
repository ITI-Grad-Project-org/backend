package com.coachhub.analytics.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;

@Schema(
        name = "RosterReport",
        description =
                "Roster health for one window. The window is echoed back because both bounds are"
                    + " optional on the request.")
public record RosterReport(
        @Schema(description = "Inclusive start every session figure is counted over")
                LocalDate from,
        @Schema(description = "Inclusive end, and the reference date for daysSinceLastActivity")
                LocalDate to,
        RosterSummary summary,
        @Schema(description = "Worst adherence first; clients with nothing scheduled last")
                List<ClientRosterRow> clients) {}
