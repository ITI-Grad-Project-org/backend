package com.coachhub.analytics.service;

import com.coachhub.analytics.dto.AdherenceSummary;
import com.coachhub.analytics.dto.RosterReport;
import com.coachhub.analytics.repository.AdherenceQueryRepository;
import com.coachhub.analytics.repository.RosterQueryRepository;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnalyticsService {

    /** Matches the mobile home screen's "this week" framing without being a hard week boundary. */
    private static final int DEFAULT_WINDOW_DAYS = 30;

    private final RosterQueryRepository rosterQueries;
    private final AdherenceQueryRepository adherenceQueries;

    public AnalyticsService(
            RosterQueryRepository rosterQueries, AdherenceQueryRepository adherenceQueries) {
        this.rosterQueries = rosterQueries;
        this.adherenceQueries = adherenceQueries;
    }

    @Transactional(readOnly = true)
    public RosterReport roster(UUID tenantId, LocalDate from, LocalDate to) {
        Window window = Window.resolve(from, to);
        return new RosterReport(
                window.from(),
                window.to(),
                rosterQueries.summary(tenantId),
                rosterQueries.clients(tenantId, window.from(), window.to()));
    }

    @Transactional(readOnly = true)
    public AdherenceSummary adherence(
            UUID tenantId, UUID membershipId, LocalDate from, LocalDate to) {
        Window window = Window.resolve(from, to);
        return adherenceQueries.summary(tenantId, membershipId, window.from(), window.to());
    }

    private record Window(LocalDate from, LocalDate to) {

        /**
         * Both bounds are optional. Supplying only one anchors the window to it
         * rather than falling back to today, so ?from=... reads forward and
         * ?to=... reads backward as a caller would expect.
         */
        static Window resolve(LocalDate from, LocalDate to) {
            if (from == null && to == null) {
                LocalDate today = LocalDate.now();
                return new Window(today.minusDays(DEFAULT_WINDOW_DAYS - 1L), today);
            }
            if (from == null) {
                return new Window(to.minusDays(DEFAULT_WINDOW_DAYS - 1L), to);
            }
            if (to == null) {
                return new Window(from, from.plusDays(DEFAULT_WINDOW_DAYS - 1L));
            }
            if (to.isBefore(from)) {
                throw new IllegalArgumentException("'to' must not be before 'from'");
            }
            return new Window(from, to);
        }
    }
}
