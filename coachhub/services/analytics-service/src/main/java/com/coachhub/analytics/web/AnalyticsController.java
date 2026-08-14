package com.coachhub.analytics.web;

import com.coachhub.analytics.dto.AdherenceSummary;
import com.coachhub.analytics.dto.RosterReport;
import com.coachhub.analytics.service.AnalyticsService;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only reporting endpoints.
 *
 * <p>The service is ClusterIP-only and is not exposed through the ingress, so
 * the tenant is taken from the path rather than a token — core-api is the
 * authenticating edge and is the only intended caller. Publishing this outside
 * the cluster would need real authorisation first.
 */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService analytics;

    public AnalyticsController(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    /** Roster health: status mix, MRR, and every client ranked by adherence. */
    @GetMapping("/tenants/{tenantId}/roster")
    public RosterReport roster(
            @PathVariable UUID tenantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to) {
        return analytics.roster(tenantId, from, to);
    }

    /** Adherence for the whole tenant, or one client when membershipId is given. */
    @GetMapping("/tenants/{tenantId}/adherence")
    public AdherenceSummary adherence(
            @PathVariable UUID tenantId,
            @RequestParam(required = false) UUID membershipId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
                    LocalDate to) {
        return analytics.adherence(tenantId, membershipId, from, to);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<String> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }
}
