-- Local development fixture for the AI knowledge base.
--
-- WHY THIS EXISTS
-- A fresh dev database is effectively empty, so an ingest run produces almost
-- nothing and there is no way to tell a working retriever from a broken one.
-- More importantly, tenant isolation cannot be tested with a single tenant:
-- this seeds TWO, each with an exercise the other does not have and a
-- deliberately distinctive name, so a search that leaks across tenants is
-- obvious rather than theoretical.
--
--   Tenant A  "Iron Forge"     — has "Zercher Squat", client profile for Sara
--   Tenant B  "Coastal Cardio" — has "Kettlebell Turkish Get-Up"
--
-- Neither name appears in the curated corpus, so retrieving one is proof the
-- core_db ingest ran, and retrieving the WRONG one is proof isolation failed.
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING and the ids are fixed, so
-- re-running it is a no-op. Safe to apply repeatedly during development.
--
-- Usage:
--   docker compose exec -T postgres psql -U postgres -d core_db \
--     < deploy/docker/rag-dev-seed.sql
--
-- NEVER run this against production — it writes rows core-api did not create.

BEGIN;

-- ── Coaches (tenants need an owner) ─────────────────────────────────────────
-- password_hash is a bcrypt hash of 'DevPassw0rd!' — these accounts exist so
-- the tenants are well-formed, not so anyone logs in as them.
INSERT INTO coaches (id, email, password_hash, first_name, last_name,
                     specialties, certifications, transformation_photos,
                     social_links, is_email_verified, is_phone_verified,
                     "resetOtpAttempts", created_at, updated_at)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'ironforge.dev@example.com',
   '$2b$10$3euPcmQFCiblsZeEu5s7p.9OVHgeHWFxWl5.tQpXqCJ0uUJ5rC2Iu',
   'Ada', 'Ironside', '{}', '[]'::jsonb, '{}', '{}'::jsonb,
   true, false, 0, now(), now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'coastalcardio.dev@example.com',
   '$2b$10$3euPcmQFCiblsZeEu5s7p.9OVHgeHWFxWl5.tQpXqCJ0uUJ5rC2Iu',
   'Bo', 'Marlow', '{}', '[]'::jsonb, '{}', '{}'::jsonb,
   true, false, 0, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ── Tenants ─────────────────────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug, accepting_clients, timezone, currency,
                     settings, created_at, updated_at, owner_coach_id)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Iron Forge', 'iron-forge-dev',
   true, 'Africa/Cairo', 'EGP', '{}'::jsonb, now(), now(),
   'aaaaaaaa-0000-4000-8000-000000000001'),
  ('22222222-2222-4222-8222-222222222222', 'Coastal Cardio', 'coastal-cardio-dev',
   true, 'Africa/Cairo', 'EGP', '{}'::jsonb, now(), now(),
   'bbbbbbbb-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- ── Tenant A exercise library ───────────────────────────────────────────────
INSERT INTO exercises (id, tenant_id, name, category, primary_muscle,
                       secondary_muscles, equipment, instruction_steps,
                       is_active, created_at, updated_at)
VALUES
  ('a0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Zercher Squat', 'strength', 'quads',
   '{glutes,core}'::muscle_group[], '{barbell}'::equipment_type[],
   ARRAY['Rest the barbell in the crook of your elbows and hug it to your chest.',
         'Brace hard and squat down keeping your torso as upright as possible.',
         'Drive up through mid-foot without letting the bar drift forward.'],
   true, now(), now()),
  ('a0000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Barbell Bench Press', 'strength', 'chest',
   '{triceps,shoulders}'::muscle_group[], '{barbell}'::equipment_type[],
   ARRAY['Lie flat and grip the bar slightly wider than shoulder-width.',
         'Lower under control to mid-chest with elbows at roughly 45 degrees.',
         'Press back up to full extension over the shoulder joint.'],
   true, now(), now()),
  ('a0000003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'Romanian Deadlift', 'strength', 'hamstrings',
   '{glutes,back}'::muscle_group[], '{barbell}'::equipment_type[],
   ARRAY['Hold the bar at hip height with a soft knee bend.',
         'Push the hips backward, letting the bar graze the thighs.',
         'Stop when you feel a strong hamstring stretch, then drive the hips forward.'],
   true, now(), now()),
  ('a0000004-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111',
   'Bodyweight Pull-up', 'strength', 'back',
   '{biceps,forearms}'::muscle_group[], '{none}'::equipment_type[],
   ARRAY['Hang from the bar with shoulder blades relaxed.',
         'Depress and retract the shoulder blades before bending the arms.',
         'Pull until the chin clears the bar, then lower under control.'],
   true, now(), now()),
  ('a0000005-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111',
   'Seated Cable Row', 'strength', 'back',
   '{biceps}'::muscle_group[], '{machines}'::equipment_type[],
   ARRAY['Sit tall with a slight forward lean at the start.',
         'Pull with the elbow, not the hand, until the upper arm lines up with the torso.',
         'Return under control without letting the shoulders round forward.'],
   true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ── Tenant B exercise library ───────────────────────────────────────────────
INSERT INTO exercises (id, tenant_id, name, category, primary_muscle,
                       secondary_muscles, equipment, instruction_steps,
                       is_active, created_at, updated_at)
VALUES
  ('b0000001-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   'Kettlebell Turkish Get-Up', 'strength', 'full_body',
   '{shoulders,core}'::muscle_group[], '{kettlebell}'::equipment_type[],
   ARRAY['Lie on your back holding the kettlebell locked out over one shoulder.',
         'Roll to your elbow, then your hand, keeping the bell overhead throughout.',
         'Bridge, sweep the trailing leg through to a lunge, and stand.',
         'Reverse every step precisely to return to the floor.'],
   true, now(), now()),
  ('b0000002-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   'Assault Bike Intervals', 'cardio', 'full_body',
   '{quads,shoulders}'::muscle_group[], '{machines}'::equipment_type[],
   ARRAY['Warm up for five minutes at conversational effort.',
         'Sprint hard for 20 seconds, then pedal easy for 40 seconds.',
         'Repeat for eight to twelve rounds depending on conditioning.'],
   true, now(), now()),
  ('b0000003-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   'Jump Rope Double-Unders', 'plyometric', 'calves',
   '{forearms,core}'::muscle_group[], '{none}'::equipment_type[],
   ARRAY['Start with a relaxed grip and the rope behind the heels.',
         'Jump slightly higher than a single-under and snap the wrists twice.',
         'Keep the elbows close to the ribs rather than flaring outward.'],
   true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- ── Tenant A nutrition library ──────────────────────────────────────────────
INSERT INTO foods (id, tenant_id, name, brand, serving_size, serving_unit,
                   calories, protein_g, carbs_g, fat_g, fiber_g,
                   dietary_tags, allergens, is_active, created_at, updated_at,
                   created_by)
VALUES
  ('a1000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Grilled Chicken Breast', 'Generic', 100, 'g', 165, 31, 0, 3.6, 0,
   '{halal,gluten_free,low_carb}'::dietary_preference[], '{}', true, now(), now(), 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('a1000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Red Lentils, dry', 'Generic', 100, 'g', 352, 24.6, 60, 1.1, 10.7,
   '{vegan,vegetarian,halal,gluten_free}'::dietary_preference[], '{}', true, now(), now(), 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('a1000003-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111',
   'Whey Protein Isolate', 'Generic', 30, 'scoop', 113, 27, 1, 0.5, 0,
   '{halal,gluten_free,low_carb}'::dietary_preference[], '{milk}', true, now(), now(), 'aaaaaaaa-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO meals (id, tenant_id, name, description, prep_notes,
                   dietary_tags, allergens, is_active, created_at, updated_at,
                   created_by)
VALUES
  ('a2000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'Koshari Power Bowl',
   'Rice, brown lentils and macaroni with spiced tomato sauce and crispy onions. A high-carb Egyptian staple rebuilt to hit a protein target.',
   'Cook lentils and rice separately so the texture holds. Add grilled chicken or extra lentils to reach 40 g protein.',
   '{halal,vegetarian}'::dietary_preference[], '{wheat}', true, now(), now(), 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('a2000002-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   'Overnight Oats with Whey',
   'Rolled oats soaked overnight with milk, whey isolate and berries. Built for a fast pre-training breakfast.',
   'Mix the whey in after soaking, not before, or it turns rubbery.',
   '{halal,vegetarian}'::dietary_preference[], '{milk,gluten}', true, now(), now(), 'aaaaaaaa-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── Tenant A client + intake ────────────────────────────────────────────────
-- The sensitive source: this carries injuries and medical conditions, and is
-- exactly what must never surface for tenant B.
INSERT INTO clients (id, email, password_hash, first_name, last_name,
                     timezone, is_email_verified, is_phone_verified,
                     "resetOtpAttempts", created_at, updated_at)
VALUES
  ('c0000001-0000-4000-8000-000000000001', 'sara.dev@example.com',
   '$2b$10$3euPcmQFCiblsZeEu5s7p.9OVHgeHWFxWl5.tQpXqCJ0uUJ5rC2Iu',
   'Sara', 'Malik', 'Africa/Cairo', true, false, 0, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (id, tenant_id, client_id, status, joined_at,
                         created_at, updated_at)
VALUES
  ('d0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'c0000001-0000-4000-8000-000000000001', 'active', now(), now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO client_intakes (id, tenant_id, membership_id, goal,
                            training_experience, training_days_per_week,
                            focus_areas, training_styles, available_equipment,
                            dietary_preferences, allergies, medical_conditions,
                            injuries, notes, created_at, updated_at)
VALUES
  ('e0000001-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   'd0000001-0000-4000-8000-000000000001', 'fat_loss', 'beginner', 3,
   '{strength,weight_loss}'::focus_area[], '{strength,hypertrophy}'::training_style[],
   '{dumbbells,resistance_bands}'::equipment_type[],
   '{halal}'::dietary_preference[],
   ARRAY['peanuts'], ARRAY['asthma'], ARRAY['left shoulder impingement'],
   'Prefers early morning sessions before work. Avoid overhead pressing until the shoulder is reassessed.',
   now(), now())
ON CONFLICT (id) DO NOTHING;

COMMIT;

\echo ''
\echo 'RAG dev seed applied. Chunk counts the ingest should now find:'
SELECT t.name AS tenant,
       (SELECT count(*) FROM exercises e WHERE e.tenant_id = t.id AND e.is_active) AS exercises,
       (SELECT count(*) FROM foods f WHERE f.tenant_id = t.id AND f.is_active) AS foods,
       (SELECT count(*) FROM meals m WHERE m.tenant_id = t.id AND m.is_active) AS meals,
       (SELECT count(*) FROM client_intakes ci WHERE ci.tenant_id = t.id) AS intakes
FROM tenants t
WHERE t.id IN ('11111111-1111-4111-8111-111111111111',
               '22222222-2222-4222-8222-222222222222')
ORDER BY t.name;
