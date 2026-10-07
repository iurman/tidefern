-- Custom SQL migration file, put your code below! --

-- Account closure on the app role (task E10, architecture records 7.2 and
-- 11). POST /v1/me/close, and the consent withdrawal that starts a closure,
-- revoke every grant the person gave or holds, each with its grant.revoke
-- audit row, in the transaction that files her closure. Both routes now run
-- that transaction as the person, inside withActor() on the request pool,
-- which is tidefern_app on CI and in production. Before, they ran
-- withSystem() on that pool, where is_system() is false by design, and
-- failed on the data_requests insert policy. Under her own policies two of
-- the closure's writes are still refused:
--
-- - grants_update lets the owner, or a guardian of the child, revoke, so a
--   grant someone gave her (she is the grantee) matches no row and would
--   stay live for the whole undo window;
-- - audit_events_insert wants can_use_key(subject), so a child grant she
--   still owns after stepping down as that child's guardian cannot be
--   audited in her name.
--
-- revoke_closure_grants(closing_at) is that one step for current_actor()
-- and nothing else. It needs an open closure of hers (the route writes the
-- request row first, in the same transaction), revokes every live grant
-- she owns or holds at the instant the route passes, so the grants, the
-- audit rows and the request carry one time, writes one grant.revoke row
-- per grant it revoked in her name (the subject is the child for a child
-- grant and the owner otherwise, as the API's audit helper files them), and
-- answers whether it was allowed. It takes no person, so it cannot be
-- pointed at anyone else, and it returns no row.
--
-- It follows the B8 and B14 conventions: SECURITY DEFINER, SET search_path =
-- pg_catalog, public, and the app.policy_helper marker. On Neon the
-- function's owner is bound by FORCE, so the two policies it writes through
-- let the marker in, and only for the current actor's own rows: grants she
-- is a party to, and audit rows in her own name. The marker counts only
-- when current_user is not tidefern_app, so the app role setting it by hand
-- changes nothing; src/e10-closure-grants.test.ts proves both, and re-owns
-- the function to a role that cannot bypass RLS to prove the Neon path.

ALTER POLICY grants_update ON grants
  USING (is_system()
         OR (in_policy_helper() AND (owner_id = current_actor() OR grantee_id = current_actor()))
         OR owner_id = current_actor()
         OR (child_id IS NOT NULL AND is_guardian(child_id)))
  WITH CHECK (is_system()
              OR (in_policy_helper()
                  AND (owner_id = current_actor() OR grantee_id = current_actor()))
              OR owner_id = current_actor()
              OR (child_id IS NOT NULL AND is_guardian(child_id)));
--> statement-breakpoint
ALTER POLICY audit_events_insert ON audit_events
  WITH CHECK (is_system()
              OR (in_policy_helper() AND actor_id = current_actor())
              OR (actor_id = current_actor() AND can_use_key(subject_id)));
--> statement-breakpoint

-- True once every live grant in either direction is revoked and audited;
-- false, with nothing written, when there is no actor, no instant, or no
-- open closure of hers. VOLATILE because it writes.
CREATE FUNCTION revoke_closure_grants(closing_at timestamptz) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    DECLARE
      actor uuid := current_actor();
    BEGIN
      IF actor IS NULL OR revoke_closure_grants.closing_at IS NULL THEN
        RETURN false;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM data_requests r
        WHERE r.user_id = actor
          AND r.kind = 'closure'
          AND r.state IN ('requested', 'in_progress')
      ) THEN
        RETURN false;
      END IF;

      WITH revoked AS (
        UPDATE grants g
          SET revoked_at = revoke_closure_grants.closing_at,
              updated_at = revoke_closure_grants.closing_at,
              version = g.version + 1
          WHERE (g.owner_id = actor OR g.grantee_id = actor)
            AND g.revoked_at IS NULL
            AND g.deleted_at IS NULL
          RETURNING g.owner_id, g.category, g.child_id
      )
      INSERT INTO audit_events (id, actor_id, action, subject_id, category, child_id, occurred_at)
        SELECT uuidv7(), actor, 'grant.revoke', coalesce(r.child_id, r.owner_id),
               r.category::text::data_category, r.child_id, revoke_closure_grants.closing_at
        FROM revoked r;
      RETURN true;
    END
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION revoke_closure_grants(timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION revoke_closure_grants(timestamptz) TO tidefern_app;
