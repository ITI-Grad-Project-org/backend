-- Demo data for the analytics endpoints. DEV ONLY — never run this against a
-- database holding real clients.
--
-- Reference date: 2026-08-15 (a Saturday; that week's Monday is 2026-08-10).
-- Every value is chosen so the expected API output can be worked out by hand,
-- which is what makes this a test and not just a pile of rows:
--
--   roster.active            3          (Alpha, Bravo, Charlie)
--   roster.mrrByCurrency     {USD: 250} (100 + 150; Charlie has no price)
--   sessionAdherencePct      72.7       (8 completed / 11 scheduled in window)
--   clientsAtRisk            1          (Bravo only — Charlie joined yesterday)
--   checkinsAwaitingReview   2          (Bravo waited 10 days, Alpha 3)
--   programsEndingSoon       1          (Alpha's, 1 day left, 80% complete)
--   thisWeek                 3 vs 5     (-40.0%)
--   Alpha's Back Squat       116.67 -> 128.33 e1RM (+10.0%)
--
-- The 20-rep set on 2026-08-10 is deliberate: Epley would score it 166.67 and
-- make it the best day. It must be excluded by the reps<=12 cap, leaving 128.33.
--
-- Re-runnable: the DELETEs below drop anything a previous run left behind.
-- Requires the tenant and coach that already exist in a seeded dev database.
--
--   docker compose exec -T postgres psql -U postgres -d core_db \
--       < deploy/docker/analytics-demo-data.sql
BEGIN;

\set tid '''a16e7c0a-8c14-4566-adda-24b42ce08e1f'''

-- Teardown first, so the script is idempotent.
--
-- Explicit order rather than relying on the client cascade: programs.membership_id
-- and logged_exercises.planned_exercise_id are both RESTRICT, so deleting a client
-- fails while its programme still exists, and deleting a programme fails while a
-- logged session still points at its planned exercises. Sessions, then programmes,
-- then the client.
DELETE FROM logged_workouts WHERE membership_id IN (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003');
DELETE FROM programs WHERE id IN (
  'b0000000-0000-4000-8000-00000000000a',
  'b0000000-0000-4000-8000-00000000000c');
DELETE FROM clients WHERE email IN
  ('alpha@fixture.test', 'bravo@fixture.test', 'charlie@fixture.test');
DELETE FROM exercises WHERE id = 'c0000000-0000-4000-8000-0000000000e1';
\set ma  '''a0000000-0000-4000-8000-000000000001'''
\set mb  '''a0000000-0000-4000-8000-000000000002'''
\set mc  '''a0000000-0000-4000-8000-000000000003'''
\set pa  '''b0000000-0000-4000-8000-00000000000a'''
\set pc  '''b0000000-0000-4000-8000-00000000000c'''
\set ex  '''c0000000-0000-4000-8000-0000000000e1'''

INSERT INTO clients (id, email, first_name, last_name) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'alpha@fixture.test',   'Alpha',   'Adherent'),
  ('d0000000-0000-4000-8000-000000000002', 'bravo@fixture.test',   'Bravo',   'Quiet'),
  ('d0000000-0000-4000-8000-000000000003', 'charlie@fixture.test', 'Charlie', 'New');

-- MA trains, MB has gone quiet (last activity 2026-08-01 = 14 days), MC joined
-- yesterday and has never logged — MC must NOT appear at risk.
INSERT INTO memberships (id, tenant_id, client_id, status, monthly_price, currency, joined_at) VALUES
  (:ma, :tid, 'd0000000-0000-4000-8000-000000000001', 'active', 100.00, 'USD', '2026-06-01T00:00:00Z'),
  (:mb, :tid, 'd0000000-0000-4000-8000-000000000002', 'active', 150.00, 'USD', '2026-06-01T00:00:00Z'),
  (:mc, :tid, 'd0000000-0000-4000-8000-000000000003', 'active', NULL,   'USD', '2026-08-14T00:00:00Z');

-- PA ends 2026-08-03 + 13 = 2026-08-16 -> 1 day left, inside the 14-day horizon.
-- PC ends 2026-11-06 -> outside it.
INSERT INTO programs (id, tenant_id, created_by, program_type, membership_id, name,
                      duration_weeks, start_date, end_date, status, is_archived)
SELECT :pa, :tid, co.id, 'client', :ma, '2-Week Base',  2,  DATE '2026-08-03', DATE '2026-08-16', 'published', false FROM coaches co LIMIT 1;
INSERT INTO programs (id, tenant_id, created_by, program_type, membership_id, name,
                      duration_weeks, start_date, end_date, status, is_archived)
SELECT :pc, :tid, co.id, 'client', :mc, '12-Week Build', 12, DATE '2026-08-15', DATE '2026-11-06', 'published', false FROM coaches co LIMIT 1;

INSERT INTO program_weeks (id, tenant_id, program_id, week_number)
SELECT gen_random_uuid(), :tid, :pa, w FROM generate_series(1, 2) w;
INSERT INTO program_weeks (id, tenant_id, program_id, week_number)
SELECT gen_random_uuid(), :tid, :pc, w FROM generate_series(1, 12) w;

-- PA trains Mon-Fri (5/week -> 10 sessions). PC trains Mon-Wed (3/week).
INSERT INTO program_days (id, tenant_id, program_week_id, day_number, is_rest_day)
SELECT gen_random_uuid(), :tid, w.id, d, d > 5
FROM program_weeks w, generate_series(1, 7) d
WHERE w.program_id = :pa;
INSERT INTO program_days (id, tenant_id, program_week_id, day_number, is_rest_day)
SELECT gen_random_uuid(), :tid, w.id, d, d > 3
FROM program_weeks w, generate_series(1, 7) d
WHERE w.program_id = :pc;

INSERT INTO exercises (id, tenant_id, name, category, primary_muscle)
VALUES (:ex, :tid, 'Back Squat', 'strength', 'quads');

-- 8 of PA's 10 sessions completed: 5 in the week of 2026-08-03, 3 in the week
-- of 2026-08-10. Week-over-week is therefore 3 vs 5 = -40.0%.
INSERT INTO logged_workouts (id, tenant_id, membership_id, program_id, program_day_id,
                             scheduled_date, status, completed_at)
SELECT gen_random_uuid(), :tid, :ma, :pa, d.id,
       DATE '2026-08-03' + ((w.week_number - 1) * 7 + (d.day_number - 1)),
       'completed',
       (DATE '2026-08-03' + ((w.week_number - 1) * 7 + (d.day_number - 1)))::timestamptz
FROM program_weeks w
JOIN program_days d ON d.program_week_id = w.id
WHERE w.program_id = :pa
  AND NOT d.is_rest_day
  AND (w.week_number = 1 OR d.day_number <= 3);

-- Squat work on two days only, to keep the strength curve hand-checkable.
INSERT INTO planned_exercises (id, tenant_id, program_day_id, exercise_id, exercise_name,
                               category, primary_muscle, position)
SELECT gen_random_uuid(), :tid, d.id, :ex, 'Back Squat', 'strength', 'quads', 1
FROM program_weeks w
JOIN program_days d ON d.program_week_id = w.id
WHERE w.program_id = :pa AND d.day_number = 1;

INSERT INTO planned_sets (id, planned_exercise_id, set_number, set_type, reps_min)
SELECT gen_random_uuid(), pe.id, s, 'working', 5
FROM planned_exercises pe, generate_series(1, 3) s
WHERE pe.tenant_id = :tid;

INSERT INTO logged_exercises (id, logged_workout_id, planned_exercise_id, exercise_id,
                              exercise_name, position)
SELECT gen_random_uuid(), lw.id, pe.id, :ex, 'Back Squat', 1
FROM logged_workouts lw
JOIN planned_exercises pe ON pe.program_day_id = lw.program_day_id
WHERE lw.membership_id = :ma;

-- 2026-08-03: 100kg x 5 -> Epley e1RM 116.67.  2026-08-10: 110kg x 5 -> 128.33.
INSERT INTO logged_sets (id, logged_exercise_id, planned_set_id, set_number, is_extra,
                         prescribed_set_type, prescribed_reps_min, prescribed_weight_kg,
                         reps, weight_kg, outcome)
SELECT gen_random_uuid(), le.id, ps.id, ps.set_number, false,
       'working', 5, CASE WHEN lw.scheduled_date = DATE '2026-08-03' THEN 100.00 ELSE 110.00 END,
       5,             CASE WHEN lw.scheduled_date = DATE '2026-08-03' THEN 100.00 ELSE 110.00 END,
       'completed'
FROM logged_exercises le
JOIN logged_workouts lw ON lw.id = le.logged_workout_id
JOIN planned_sets ps ON ps.planned_exercise_id = le.planned_exercise_id;

-- A 20-rep set on the second day. Epley would score this 166.67 and make it the
-- best day; the reps<=12 cap must exclude it, leaving 128.33.
INSERT INTO logged_sets (id, logged_exercise_id, planned_set_id, set_number, is_extra,
                         reps, weight_kg, outcome)
SELECT gen_random_uuid(), le.id, NULL, 4, true, 20, 100.00, 'completed'
FROM logged_exercises le
JOIN logged_workouts lw ON lw.id = le.logged_workout_id
WHERE lw.scheduled_date = DATE '2026-08-10';

INSERT INTO activity_logs (id, client_id, tenant_id, membership_id, activity_type,
                           source_key, activity_date, occurred_at) VALUES
  (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001', :tid, :ma,
   'workout_set_reported', 'fixture-ma-1', DATE '2026-08-12', '2026-08-12T09:00:00Z'),
  (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001', :tid, :ma,
   'nutrition_meal_reported', 'fixture-ma-2', DATE '2026-08-14', '2026-08-14T18:30:00Z'),
  (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000002', :tid, :mb,
   'workout_set_reported', 'fixture-mb-1', DATE '2026-08-01', '2026-08-01T07:15:00Z');

-- Two awaiting review (MB waited longest and must sort first), one already answered.
INSERT INTO checkins (id, tenant_id, membership_id, scheduled_for, status, submitted_at,
                      reviewed_at, reviewed_by) VALUES
  (gen_random_uuid(), :tid, :ma, DATE '2026-08-10', 'submitted', '2026-08-12T10:00:00Z', NULL, NULL),
  (gen_random_uuid(), :tid, :mb, DATE '2026-08-03', 'submitted', '2026-08-05T10:00:00Z', NULL, NULL);
INSERT INTO checkins (id, tenant_id, membership_id, scheduled_for, status, submitted_at, reviewed_at)
VALUES (gen_random_uuid(), :tid, :mc, DATE '2026-08-10', 'reviewed', '2026-08-11T10:00:00Z', '2026-08-12T10:00:00Z');

INSERT INTO measurements (id, tenant_id, membership_id, measured_at, weight_kg, body_fat_pct) VALUES
  (gen_random_uuid(), :tid, :ma, DATE '2026-08-01', 82.50, 18.4),
  (gen_random_uuid(), :tid, :ma, DATE '2026-08-15', 81.00, 17.6);

COMMIT;
