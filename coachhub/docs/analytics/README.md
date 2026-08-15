# Analytics

Eight read-only endpoints reporting on core-api's live data. This document says
what each one answers, how it is computed, and how to read the result without
drawing the wrong conclusion from it.

## Where it runs

`analytics-service` (Spring Boot) connects **directly to `core_db`** as
`analytics_user`, a role holding `SELECT` and nothing else. It does not have its
own copy of the data and does not project events into `analytics_db`.

That is a consequence of the requirement, not a preference: PostgreSQL cannot
join across databases, so reporting *on core-api's data* means reading core-api's
database in place. Hibernate is pinned to `ddl-auto: none` because TypeORM owns
this schema — see [`docs/deployment/01-system-architecture.md`](../deployment/01-system-architecture.md).

The browser never reaches `analytics-service`. Every coach-facing route is
proxied by core-api, which takes the tenant from the JWT and appends it to the
upstream path. A client cannot ask for another coach's numbers, because the
tenant is never a parameter it controls.

```
browser → core-api /analytics/*  →  analytics-service /api/analytics/tenants/{tenantId}/*  →  core_db (SELECT only)
             ↑ tenant from JWT
```

## Calling it

| | Dev | Kubernetes |
|---|---|---|
| Coach-facing API | `http://localhost:3000/analytics/*` | through the ingress, same paths |
| Swagger (core-api) | `http://localhost:3000/api/docs` | same |
| analytics-service direct | `http://localhost:8082/api/analytics/tenants/{id}/*` | **not reachable** — ClusterIP only |
| Swagger (analytics-service) | `http://localhost:8082/swagger-ui/index.html` | not exposed |

All routes need `Authorization: Bearer <coach access token>`. The full response
schemas, with per-field notes, are in both Swagger documents; this file explains
the reasoning that a schema cannot carry.

## Conventions that apply everywhere

**Windows.** `from` and `to` are inclusive ISO dates. Omit both for the last 30
days; omit one and the other anchors a 30-day window. `to` before `from` is a
`400`. Endpoints that are not windowed say so below.

**`null` never means zero.** A rate whose denominator is zero is returned as
`null`, not `0`. A client with nothing scheduled has not failed to train, and a
week with no previous week to compare against has not stayed flat. Charting the
two the same way is the single easiest way to make this API lie — treat `null`
as "no basis to answer" and render it as a dash.

**Percentages** are returned as numbers out of 100, rounded to one decimal
(`72.7` means 72.7%), except money, which keeps two.

**Tenant scoping** is total. Every query filters on the tenant from the token.
Asking for another tenant's client returns `404`, not an empty success — an
empty report reads as "this client did nothing", which is a different and much
more misleading answer.

---

## 1. Coach home screen

`GET /analytics/overview?from&to`

**Answers:** everything the coach sees when they open the app, in one request.

Returns the roster counters and MRR, headline session adherence, this week's
training volume against last week's with a per-weekday breakdown, and the size
of each of the three attention queues.

The three counts are **badges**. The rows behind them come from `/attention`,
computed at the same default thresholds — so a badge saying 3 always opens a
list of 3. That consistency is deliberate: the counts are taken as the length of
those same lists rather than from separate `COUNT` queries, which is how a badge
and its list drift apart.

**Reading it.** `thisWeek` is derived from the window's *end* date, not from
today, so requesting a historical window reports that week rather than the
current one. The week runs Monday to Sunday. `byDay` always has seven rows
including empty days, so the bar chart needs no gap-filling.

## 2. Needs you now

`GET /analytics/attention?asOf&riskThresholdDays&endingHorizonDays`

**Answers:** what decays if the coach does nothing today.

Three lists, each sorted most-urgent-first, kept in one call because they are
read as one panel — and kept as three lists rather than one merged feed because
the actions differ: message, review, renew.

| List | Rule |
|---|---|
| `atRisk` | Active clients silent for ≥ `riskThresholdDays` (default 7) |
| `checkinsAwaitingReview` | Check-ins submitted with no coach response, oldest first |
| `programsEndingSoon` | Client programmes ending within `endingHorizonDays` (default 14) |

**How silence is measured.** From the last logged activity of *any* kind — a
workout set, a meal, anything — because a client eating to plan but not lifting
has not disappeared. For a client who has never logged anything, it counts from
their **join date** instead. Without that fallback every new signup would appear
here on day one, which is the fastest way to train a coach to ignore the list.
`neverActive` flags those clients so the UI can word them differently.

Only `active` memberships qualify. A paused client is quiet on purpose.

**`programsEndingSoon` carries `completionPct`** for the programme's whole run,
not the reporting window, so the coach can tell a client finishing strong from
one who stalled in week 2 before deciding what to write next.

## 3. Activity feed

`GET /analytics/activity?from&to&limit`

**Answers:** what clients have been logging, newest first.

Ordered by the instant each thing happened, **not** by its training date. The
training date is the client's own local day and many rows share one value, so it
cannot order a feed within a day. Those two can differ by a day for clients
training either side of midnight or in a different timezone from their coach.

**This is not an audit trail.** Rows are deleted when a client un-logs
something, so the feed reflects what a client currently claims to have done. Do
not use it to reconstruct history.

`limit` defaults to 50 and is capped at 200 by analytics; core-api rejects
anything outside 1–200 at the edge.

## 4. Roster health

`GET /analytics/roster?from&to`

**Answers:** who is on the roster, what they are worth, and who is slipping.

Status mix, MRR per currency, and every client as a row ordered
worst-adherence-first. The risk list and the leaderboard are the same rows read
from opposite ends, which is why this is one call and not two.

**MRR is a map keyed by ISO 4217 code, not a single total.** Memberships carry
their own currency and there is no FX rate in the system; summing across them
would invent a number. A single-currency practice gets a one-entry map.

**Ordering.** Clients with nothing scheduled sort last with `adherencePct: null`
— they have no programme, so they cannot be behind on one. Everyone else sorts
by adherence ascending, then by name.

## 5. Adherence against the prescription

`GET /analytics/adherence?membershipId&from&to`

**Answers:** did the prescribed work actually happen. Two independent readings.

**Session completion** counts logged sessions against the sessions the programme
*scheduled* — not against sessions that were started. Days a client never opened
the app still count against them, which is the whole point; measuring against
started sessions would report a client who trained once and quit as 100%
adherent.

Scheduled dates are derived, not stored: programme structure is relative (week
1..N, day 1..7) and only `programs.start_date` anchors it to the calendar.

**Volume adherence** compares actual reps × weight against the prescription
carried on each logged set.

> Read `volumeAdherencePct` next to `comparableSets`. Sets prescribed by RPE or
> %1RM carry no absolute target and are excluded from both sides of the ratio, as
> are extra sets the client added. A programme written entirely in RPE returns
> `comparableSets: 0` and a `null` ratio — that is "not measurable this way", not
> "not adherent".

Omit `membershipId` for the whole roster.

## 6. Client outcomes

`GET /analytics/clients/{membershipId}/progress?from&to`

**Answers:** is the body changing and are the lifts going up.

Every other endpoint here measures compliance — whether the work got done. This
one measures whether the work *worked*, which is the question the client
actually asks.

**Measurements** are returned exactly as recorded. Clients fill in different
subsets on different days, and every field is nullable; values are never carried
forward, so a gap stays a gap rather than becoming a flat line through days
nobody measured.

**Strength** uses the Epley estimate — `weight × (1 + reps / 30)` — of a one-rep
max, per exercise per training day, with the best set of the day winning. It is
an estimate, not a tested max. The point is that it lets a 5×100kg day and an
8×90kg day sit on the same axis, which is the only way a progression line means
anything once the prescription changes.

> **Capped at 12 reps.** Epley is fitted to low rep ranges and inflates fast
> beyond about a dozen: a 20-rep set would report a 1RM two thirds above the
> weight actually moved, and one high-rep finisher would put a spike in the chart
> that looks like a personal best. A missing point is recoverable; a fabricated
> PR is what the client screenshots. Bodyweight and timed work carry no load and
> drop out for the same reason — "is the load going up" is not a question they
> can answer.

Exercises are grouped by the **name recorded on the logged row**, not by exercise
id, so a lift keeps one continuous line even if the coach later repoints it at a
different library entry. Most-trained exercise leads. `changePct` is `null` when
the window holds a single training day — one point is not a trend.

## 7. Programme effectiveness

`GET /analytics/programs/effectiveness`

**Answers:** which templates actually work once assigned.

Aggregates every client programme back to the template it came from via
`programs.source_template_id`, ordered by how widely each template has been used.

**Not date-windowed**, deliberately. A template's track record is its whole
history; a window would rank templates by how recently they happened to be
assigned rather than by how well they perform.

**Read `avgLastActiveWeek` against `durationWeeks`.** That gap is where the
template is losing people — a 12-week programme whose clients stop at week 5 is
not a 12-week programme. Programmes with no completed session contribute `null`
and are excluded from that mean rather than counted as week 0, which would
punish a template for clients who never started.

## 8. Template retention curve

`GET /analytics/programs/{templateId}/survival`

**Answers:** *which* week a template loses people.

Week-by-week share of derived programmes still training. A programme reaches
week N if its last completed session was in week N or later, so **the curve
never rises** and the week it drops is the week to rewrite.

Emits a row per planned week including dead ones, so it plots without
gap-filling. Unknown template for this tenant returns `404`.

---

## Reference

**Response schemas:** core-api Swagger at `/api/docs`, or analytics-service at
`/swagger-ui/index.html` in dev. Every field carries the same reasoning as above
in its description.

**Demo data:** [`deploy/docker/analytics-demo-data.sql`](../../deploy/docker/analytics-demo-data.sql)
seeds three clients whose expected output is worked out by hand in the file's
header — including a 20-rep set that must *not* appear in the strength curve.
Re-runnable, dev only.

```bash
docker compose exec -T postgres psql -U postgres -d core_db \
    < deploy/docker/analytics-demo-data.sql
```

**Grants:** analytics reads core_db through a `SELECT`-only role. If endpoints
fail with `bad SQL grammar`, check the grants before assuming a schema drift —
Spring maps SQLState `42501` (insufficient privilege) and `42703` (undefined
column) to the same exception. See
[`docs/deployment/02-docker-deployment.md` §2.1](../deployment/02-docker-deployment.md).

## Known gap

`checkinsAwaitingReview` reads the `checkins` table, which currently has a schema
and no API. Nothing writes to it, so that queue reads zero in any environment
without seeded data, and `daysWaiting` has never been exercised against real
traffic. The check-in write path — submit, review, respond — is the next piece of
work; the analytics side is already in place and needs no changes when it lands.
