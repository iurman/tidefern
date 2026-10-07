-- Custom SQL migration file, put your code below! --

-- The calendar clock reaches the status function (task E11, architecture
-- record 15 and 17.1). Migration 0010 computed "today" in
-- cycle_status_for(subject) from now(), so a server whose calendar is
-- frozen by TIDEFERN_FAKE_NOW (local runs and CI, never production) still
-- answered the real day, and every status read drifted a day per day away
-- from the seeded cast. The API now hands its frozen instant to the
-- function through the transaction-local setting app.calendar_now, which it
-- writes inside the actor's withActor transaction just before the call
-- (calendar clock in packages/api/src/clock.ts). With the setting unset or
-- empty the function reads now() exactly as before, which is all production
-- ever does: the API writes the setting only when the clock is frozen, and
-- the clock refuses to freeze when VERCEL_ENV is production. The empty
-- string counts as unset because a pooled connection keeps a custom setting
-- defined, empty, after the transaction that set it locally has ended.
--
-- Nothing else changes. The definition below is 0010's with the one
-- instant replaced: the same signature and result columns, STABLE, SECURITY
-- DEFINER, SET search_path = pg_catalog, public and the app.policy_helper
-- marker, the same re-check of can_read(subject, 'cycle.status'), the same
-- pregnancy boundary for anyone but the subject. CREATE OR REPLACE keeps
-- the owner and the privileges; the REVOKE and GRANT are restated so the
-- file shows them. The other three functions of 0010 decide no calendar day
-- (refresh_cycle_prediction's now() stamps computed_at, created_at,
-- updated_at and deleted_at, which stay real), so they are left as they are.
--
-- The function still takes no date argument. The setting is not a way
-- around that for a grantee: only the API writes app.* settings in an
-- actor's transaction, it writes app.calendar_now only from its clock and
-- never from a request, and any code that could write it as tidefern_app
-- could equally write app.actor_id, which the policies already trust.

CREATE OR REPLACE FUNCTION cycle_status_for(subject uuid)
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
      calendar_now timestamptz;
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
      calendar_now := coalesce(
        nullif(current_setting('app.calendar_now', true), '')::timestamptz,
        now()
      );
      today := (calendar_now AT TIME ZONE coalesce(zone, 'UTC'))::date;

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

REVOKE EXECUTE ON FUNCTION cycle_status_for(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cycle_status_for(uuid) TO tidefern_app;
