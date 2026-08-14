package com.coachhub.analytics.dto;

import java.math.BigDecimal;

/**
 * Adherence measured against the prescription, not against app engagement.
 *
 * <p>Two independent readings. Session completion answers "did they turn up".
 * Volume adherence answers "did they do the work" — it compares actual
 * reps×weight against what was written on the plan, which is only possible
 * because logged_sets carries the prescription alongside the result.
 *
 * @param comparableSets how many logged sets carried both a prescribed weight
 *     and a prescribed rep floor. Sets prescribed by RPE or %1RM have no
 *     absolute target, so they are excluded from the volume ratio — this count
 *     is published so the ratio can be read with its coverage.
 * @param volumeAdherencePct null when comparableSets is 0, rather than 0%.
 */
public record AdherenceSummary(
        long scheduledSessions,
        long completedSessions,
        long partialSessions,
        long skippedSessions,
        long inProgressSessions,
        BigDecimal sessionCompletionPct,
        long comparableSets,
        BigDecimal prescribedVolume,
        BigDecimal actualVolume,
        BigDecimal volumeAdherencePct,
        long setsCompleted,
        long setsPartial,
        long setsSkipped,
        long setsExtra) {}
