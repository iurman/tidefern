-- Custom SQL migration file, put your code below! --

-- The derived cycle status and the prediction refresh (task B14,
-- architecture record 8.2: cycle.status is derived on read from the cycle
-- rows, never stored). A cycle.status grantee reaches no row under the B8
-- policies, and a contributor's transaction cannot see the pregnancy that
-- suspends or bounds a prediction, so both derivations run here, as the
-- function owner, and hand back derived values only:
--
-- - cycle_status_for(subject) re-checks can_read(subject, 'cycle.status')
--   for the current actor and returns today in the subject's zone, the day
--   of the cycle, the day of the period while bleeding, and whether today
--   is in the fertile window. It takes no date, so it cannot be asked about
--   another day, and it returns no entry.
-- - refresh_cycle_prediction(subject) re-checks can_write(subject,
--   'cycle.history') and keeps the one live cycle_predictions row equal to
--   what the entries and the pregnancies give, as the API's storePrediction
--   does for the subject; it answers whether the actor was allowed and
--   nothing else.
--
-- Both follow the B8 conventions: SECURITY DEFINER, SET search_path =
-- pg_catalog, public, and the app.policy_helper marker, which the select
-- policies of cycle_entries and pregnancies now let through so a Neon owner
-- bound by FORCE can read them inside these functions. The two internal
-- derivations run as their caller and are not executable by the app role,
-- so nobody calls them to read period dates.
--
-- The prediction mirrors predictCycle in packages/core and the period runs
-- mirror periodStartsFrom in packages/api (a gap of up to PERIOD_GAP_DAYS =
-- 2 days stays one period). packages/api/src/routes/cycle.test.ts
-- compares the two over the same inputs, so a change on one side fails
-- until the other follows.

ALTER POLICY cycle_entries_select ON cycle_entries
  USING (is_system() OR in_policy_helper() OR can_read(subject_id, 'cycle.history')
         OR can_read(subject_id, 'cycle.symptoms'));
--> statement-breakpoint
ALTER POLICY pregnancies_select ON pregnancies
  USING (is_system() OR in_policy_helper() OR can_read(subject_id, 'pregnancy.overview'));
--> statement-breakpoint

-- The first bleeding day of each run of bleeding days, oldest first.
-- Spotting is not bleeding; days up to two apart are one run.
CREATE FUNCTION cycle_period_starts(subject uuid) RETURNS SETOF date
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT runs.day
    FROM (
      SELECT e.date AS day, lag(e.date) OVER (ORDER BY e.date) AS previous
      FROM cycle_entries e
      WHERE e.subject_id = cycle_period_starts.subject
        AND e.deleted_at IS NULL
        AND e.flow IN ('light', 'medium', 'heavy')
    ) runs
    WHERE runs.previous IS NULL OR runs.day - runs.previous > 2
    ORDER BY runs.day
  $$;
--> statement-breakpoint

-- predictCycle over the subject's period starts with architecture record
-- 8.4 rule 4: no row while a pregnancy continues, and after one ends only
-- starts after its end count, with at least five days of uncertainty. No
-- row means no prediction (basis none).
CREATE FUNCTION cycle_prediction_facts(subject uuid)
  RETURNS TABLE (
    basis prediction_basis,
    cycle_length smallint,
    sample_size smallint,
    next_period_start date,
    ovulation date,
    fertile_window_start date,
    fertile_window_end date,
    uncertainty_days smallint,
    ovulation_band_days smallint
  )
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog, public
  AS $$
    DECLARE
      pregnant boolean;
      since date;
      starts date[];
      plausible integer[];
      samples integer;
      average integer;
      irregular boolean;
      spread integer;
      reset_floor integer;
    BEGIN
      SELECT bool_or(p.ended_at IS NULL), max(p.ended_at)
        INTO pregnant, since
        FROM pregnancies p
        WHERE p.subject_id = cycle_prediction_facts.subject
          AND p.deleted_at IS NULL;
      IF coalesce(pregnant, false) THEN
        RETURN;
      END IF;

      SELECT coalesce(array_agg(s.day ORDER BY s.day), '{}')
        INTO starts
        FROM cycle_period_starts(cycle_prediction_facts.subject) AS s(day)
        WHERE since IS NULL OR s.day > since;
      IF cardinality(starts) = 0 THEN
        RETURN;
      END IF;

      -- The most recent six completed cycles inside 21 to 45 days, oldest first.
      SELECT coalesce(array_agg(recent.days ORDER BY recent.seq), '{}')
        INTO plausible
        FROM (
          SELECT cycles.seq, cycles.days
          FROM (
            SELECT i AS seq, starts[i] - starts[i - 1] AS days
            FROM generate_subscripts(starts, 1) AS i
            WHERE i > 1
          ) cycles
          WHERE cycles.days BETWEEN 21 AND 45
          ORDER BY cycles.seq DESC
          LIMIT 6
        ) recent;
      samples := cardinality(plausible);
      irregular := samples >= 3
        AND (SELECT max(x) - min(x) FROM unnest(plausible) AS x) > 7;
      spread := CASE
        WHEN irregular THEN 5
        WHEN samples <= 1 THEN 4
        WHEN samples = 2 THEN 3
        ELSE 2
      END;
      reset_floor := CASE WHEN since IS NULL THEN 0 ELSE 5 END;

      ovulation_band_days := 2;
      uncertainty_days := greatest(spread, reset_floor);
      sample_size := samples;

      IF samples = 0 AND cardinality(starts) >= 2 THEN
        basis := 'not_enough_regular_cycles';
        RETURN NEXT;
        RETURN;
      END IF;

      IF samples = 0 THEN
        average := 28;
        basis := 'first_guess';
      ELSE
        average := round((SELECT sum(x) FROM unnest(plausible) AS x)::numeric / samples);
        basis := 'estimate';
      END IF;
      cycle_length := average;
      next_period_start := starts[cardinality(starts)] + average;
      ovulation := next_period_start - 14;
      fertile_window_start := ovulation - 5;
      fertile_window_end := ovulation;
      RETURN NEXT;
      RETURN;
    END
  $$;
--> statement-breakpoint

-- The status for today, for the subject or a holder of an active
-- cycle.status grant at any level; no row for anyone else. Anyone but the
-- subject gets the pregnancy boundary of cycle_prediction_facts: no cycle
-- or period day while a pregnancy continues, and after one ends only the
-- periods after its end count, so a day count of 100 or 400 never tells a
-- status grantee about a pregnancy, a birth or a loss filed under
-- pregnancy.overview. The subject's own status still counts through it, as
-- E3 shipped, until the owner decides otherwise.
CREATE FUNCTION cycle_status_for(subject uuid)
  RETURNS TABLE (
    today date,
    cycle_day integer,
    period_day integer,
    in_fertile_window boolean
  )
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    DECLARE
      zone text;
      latest date;
      bleeding boolean;
      window_start date;
      window_end date;
      pregnant boolean := false;
      since date;
    BEGIN
      IF NOT coalesce(can_read(cycle_status_for.subject, 'cycle.status'), false) THEN
        RETURN;
      END IF;

      IF current_actor() IS DISTINCT FROM cycle_status_for.subject THEN
        SELECT coalesce(bool_or(p.ended_at IS NULL), false), max(p.ended_at)
          INTO pregnant, since
          FROM pregnancies p
          WHERE p.subject_id = cycle_status_for.subject
            AND p.deleted_at IS NULL;
      END IF;

      SELECT pr.time_zone INTO zone
        FROM profiles pr
        WHERE pr.user_id = cycle_status_for.subject AND pr.deleted_at IS NULL;
      IF zone IS NULL THEN
        SELECT pr.time_zone INTO zone
          FROM profiles pr
          WHERE pr.user_id = current_actor() AND pr.deleted_at IS NULL;
      END IF;
      today := (now() AT TIME ZONE coalesce(zone, 'UTC'))::date;

      SELECT max(s.day) INTO latest
        FROM cycle_period_starts(cycle_status_for.subject) AS s(day)
        WHERE s.day <= today
          AND NOT pregnant
          AND (since IS NULL OR s.day > since);
      SELECT EXISTS (
        SELECT 1 FROM cycle_entries e
        WHERE e.subject_id = cycle_status_for.subject
          AND e.date = today
          AND e.deleted_at IS NULL
          AND e.flow IN ('light', 'medium', 'heavy')
      ) INTO bleeding;
      SELECT f.fertile_window_start, f.fertile_window_end
        INTO window_start, window_end
        FROM cycle_prediction_facts(cycle_status_for.subject) f;

      cycle_day := CASE WHEN latest IS NULL THEN NULL ELSE today - latest + 1 END;
      period_day := CASE WHEN latest IS NULL OR NOT bleeding THEN NULL ELSE today - latest + 1 END;
      in_fertile_window := window_start IS NOT NULL AND window_end IS NOT NULL
        AND window_start <= today AND today <= window_end;
      RETURN NEXT;
      RETURN;
    END
  $$;
--> statement-breakpoint

-- Keeps the one live cycle_predictions row equal to the facts: a new row
-- when none is live, an update when they changed, a tombstone when no date
-- is offered any more, nothing when nothing changed. True when the actor
-- may write the subject's cycle history, false (and nothing written)
-- otherwise. VOLATILE because it writes.
CREATE FUNCTION refresh_cycle_prediction(subject uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    DECLARE
      fresh record;
      live record;
      has_fresh boolean;
    BEGIN
      IF NOT coalesce(can_write(refresh_cycle_prediction.subject, 'cycle.history'), false) THEN
        RETURN false;
      END IF;

      SELECT f.* INTO fresh FROM cycle_prediction_facts(refresh_cycle_prediction.subject) f;
      has_fresh := FOUND;
      SELECT c.id, c.version, c.basis, c.cycle_length, c.sample_size, c.next_period_start,
             c.ovulation, c.fertile_window_start, c.fertile_window_end, c.uncertainty_days,
             c.ovulation_band_days
        INTO live
        FROM cycle_predictions c
        WHERE c.subject_id = refresh_cycle_prediction.subject AND c.deleted_at IS NULL;

      IF NOT has_fresh THEN
        IF live.id IS NOT NULL THEN
          UPDATE cycle_predictions
            SET deleted_at = now(), updated_at = now(), version = live.version + 1
            WHERE id = live.id;
        END IF;
        RETURN true;
      END IF;

      IF live.id IS NULL THEN
        INSERT INTO cycle_predictions (
          id, subject_id, basis, cycle_length, sample_size, next_period_start, ovulation,
          fertile_window_start, fertile_window_end, uncertainty_days, ovulation_band_days,
          computed_at, created_at, updated_at
        ) VALUES (
          uuidv7(), refresh_cycle_prediction.subject, fresh.basis, fresh.cycle_length,
          fresh.sample_size, fresh.next_period_start, fresh.ovulation,
          fresh.fertile_window_start, fresh.fertile_window_end, fresh.uncertainty_days,
          fresh.ovulation_band_days, now(), now(), now()
        );
        RETURN true;
      END IF;

      IF live.basis IS NOT DISTINCT FROM fresh.basis
         AND live.cycle_length IS NOT DISTINCT FROM fresh.cycle_length
         AND live.sample_size IS NOT DISTINCT FROM fresh.sample_size
         AND live.next_period_start IS NOT DISTINCT FROM fresh.next_period_start
         AND live.ovulation IS NOT DISTINCT FROM fresh.ovulation
         AND live.fertile_window_start IS NOT DISTINCT FROM fresh.fertile_window_start
         AND live.fertile_window_end IS NOT DISTINCT FROM fresh.fertile_window_end
         AND live.uncertainty_days IS NOT DISTINCT FROM fresh.uncertainty_days
         AND live.ovulation_band_days IS NOT DISTINCT FROM fresh.ovulation_band_days THEN
        RETURN true;
      END IF;

      UPDATE cycle_predictions
        SET basis = fresh.basis,
            cycle_length = fresh.cycle_length,
            sample_size = fresh.sample_size,
            next_period_start = fresh.next_period_start,
            ovulation = fresh.ovulation,
            fertile_window_start = fresh.fertile_window_start,
            fertile_window_end = fresh.fertile_window_end,
            uncertainty_days = fresh.uncertainty_days,
            ovulation_band_days = fresh.ovulation_band_days,
            computed_at = now(),
            updated_at = now(),
            version = live.version + 1
        WHERE id = live.id;
      RETURN true;
    END
  $$;
--> statement-breakpoint

-- The internal derivations run as their caller: inside the two functions
-- above that is the owner, and the app role may not call them at all.
REVOKE EXECUTE ON FUNCTION cycle_period_starts(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cycle_prediction_facts(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION cycle_status_for(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION refresh_cycle_prediction(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cycle_status_for(uuid) TO tidefern_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION refresh_cycle_prediction(uuid) TO tidefern_app;
