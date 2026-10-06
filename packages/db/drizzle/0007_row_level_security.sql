-- Custom SQL migration file, put your code below! --

-- Row level security for every user-data table (architecture record 7.2,
-- 8.1 to 8.3). The helpers mirror can() in packages/core: ownership,
-- guardianship of a child subject, and an active grant covering the
-- category at a sufficient level. Policies are split by command and every
-- one of them also lets system context through.
--
-- Two things the SQL has to get right that the TypeScript does not face:
--
-- 1. is_system() is true only when app.system is on AND current_user is not
--    tidefern_app, so the app connection can never claim system context.
--    Inside a SECURITY DEFINER body current_user is the function owner, so
--    the helpers never call is_system(); it appears only in policy
--    expressions, where the querying role is the one being tested.
-- 2. On Neon the table owner is bound by FORCE ROW LEVEL SECURITY (a console
--    role is a member of neon_superuser but does not inherit BYPASSRLS), so
--    a SECURITY DEFINER helper reading grants or child_guardians would hit
--    their policies and, if those policies called the helper back, recurse
--    without end. Each helper therefore runs with app.policy_helper on for
--    the duration of the call (a function-level SET, reverted on return), and
--    the policies of the five tables the helpers read let in_policy_helper()
--    through first. The marker counts only when current_user is not
--    tidefern_app, so the app role setting it by hand changes nothing; the
--    PGlite suite proves that, and also re-owns the helpers to a role that
--    cannot bypass RLS to prove the Neon path. One helper writes:
--    accept_invitation() closes an invitation for its invitee, so the
--    invitations update policy carries the marker as well.

-- The actor of the transaction, set by withActor(); null outside one.
-- The three readers of transaction settings carry COST 1 so they stay the
-- cheapest arms of every policy; the lookup helpers keep the default cost.
CREATE FUNCTION current_actor() RETURNS uuid
  LANGUAGE sql STABLE COST 1
  SET search_path = pg_catalog, public
  AS $$
    SELECT nullif(current_setting('app.actor_id', true), '')::uuid
  $$;
--> statement-breakpoint
-- System context from withSystem(): the owner role with app.system on. The
-- app role is excluded by name, whatever it sets.
CREATE FUNCTION is_system() RETURNS boolean
  LANGUAGE sql STABLE COST 1
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce(current_setting('app.system', true), '') = 'on'
       AND current_user <> 'tidefern_app'
  $$;
--> statement-breakpoint
-- True only inside a SECURITY DEFINER helper below, where the function-level
-- SET holds and current_user is the helper's owner.
CREATE FUNCTION in_policy_helper() RETURNS boolean
  LANGUAGE sql STABLE COST 1
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce(current_setting('app.policy_helper', true), '') = 'on'
       AND current_user <> 'tidefern_app'
  $$;
--> statement-breakpoint
-- The actor's sign-in email, lower-cased, for invitation matching; null
-- until Better Auth has verified it (architecture record 8.3 binds
-- acceptance to the verified email). The user table is outside RLS, so
-- this needs no definer context.
CREATE FUNCTION actor_email() RETURNS text
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT lower(u.email) FROM "user" u
    WHERE u.id = current_actor() AND u.email_verified
  $$;
--> statement-breakpoint
-- Guardianship of one child (architecture record 8.1: full rights).
CREATE FUNCTION is_guardian(child_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM child_guardians g
      WHERE g.child_id = is_guardian.child_id
        AND g.user_id = current_actor()
    )
  $$;
--> statement-breakpoint
-- Whether a child has any guardian yet; the creator becomes the first one.
CREATE FUNCTION has_guardian(child_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM child_guardians g WHERE g.child_id = has_guardian.child_id
    )
  $$;
--> statement-breakpoint
-- The household a child belongs to.
CREATE FUNCTION child_household(child_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT c.household_id FROM children c WHERE c.id = child_household.child_id
  $$;
--> statement-breakpoint
-- Active membership of a household, optionally in one role. Membership
-- grants nothing about another member's records (architecture record 8.1).
CREATE FUNCTION is_household_member(household_id uuid, member_role text DEFAULT NULL)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM household_members m
      WHERE m.household_id = is_household_member.household_id
        AND m.user_id = current_actor()
        AND m.status = 'active'
        AND (is_household_member.member_role IS NULL
             OR m.role::text = is_household_member.member_role)
    )
  $$;
--> statement-breakpoint
-- Whether a household has any member yet; the creator becomes its owner.
CREATE FUNCTION has_members(household_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM household_members m WHERE m.household_id = has_members.household_id
    )
  $$;
--> statement-breakpoint
-- An open invitation to the household, in that role, bound to the actor's
-- own email (architecture record 8.3). The acceptance route inserts the
-- membership before it marks the invitation accepted.
CREATE FUNCTION may_join(household_id uuid, member_role text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM invitations i
      WHERE i.household_id = may_join.household_id
        AND i.role::text = may_join.member_role
        AND lower(i.invitee_email) = actor_email()
        AND i.accepted_at IS NULL
        AND i.withdrawn_at IS NULL
        AND i.expires_at > now()
    )
  $$;
--> statement-breakpoint
-- The one write an invitee makes to an invitation: closing it after her
-- membership row exists. The policy no longer lets her update the row
-- herself, so household, role, expiry and token stay as the inviter set
-- them. VOLATILE because it writes; the marker lets the update through
-- the invitations policies when the owner is bound by FORCE.
CREATE FUNCTION accept_invitation(invitation_id uuid) RETURNS boolean
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    WITH closed AS (
      UPDATE invitations i
      SET accepted_at = now(), updated_at = now()
      WHERE i.id = accept_invitation.invitation_id
        AND lower(i.invitee_email) = actor_email()
        AND i.accepted_at IS NULL
        AND i.withdrawn_at IS NULL
        AND i.expires_at > now()
      RETURNING i.id
    )
    SELECT EXISTS (SELECT 1 FROM closed)
  $$;
--> statement-breakpoint
-- can(actor, "summary" | "read", resource): the owner, a guardian when the
-- subject is a child, or an active grant covering the category at any
-- level. A summary grantee sees the row; the API projects its columns.
-- journal.private is never granted. A child grant names the child, so for
-- the child category the grant matches on child_id, never on owner_id.
CREATE FUNCTION can_read(subject_id uuid, category text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT can_read.subject_id = current_actor()
        OR (can_read.category = 'child' AND is_guardian(can_read.subject_id))
        OR (can_read.category <> 'journal.private' AND EXISTS (
              SELECT 1 FROM grants g
              WHERE g.grantee_id = current_actor()
                AND g.revoked_at IS NULL
                AND g.category::text = can_read.category
                AND CASE WHEN can_read.category = 'child'
                         THEN g.child_id = can_read.subject_id
                         ELSE g.owner_id = can_read.subject_id
                    END
           ))
  $$;
--> statement-breakpoint
-- can(actor, "write", resource): the same three paths, but a grant must be
-- at the contribute level; summary and read never write.
CREATE FUNCTION can_write(subject_id uuid, category text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT can_write.subject_id = current_actor()
        OR (can_write.category = 'child' AND is_guardian(can_write.subject_id))
        OR (can_write.category <> 'journal.private' AND EXISTS (
              SELECT 1 FROM grants g
              WHERE g.grantee_id = current_actor()
                AND g.revoked_at IS NULL
                AND g.level = 'contribute'
                AND g.category::text = can_write.category
                AND CASE WHEN can_write.category = 'child'
                         THEN g.child_id = can_write.subject_id
                         ELSE g.owner_id = can_write.subject_id
                    END
           ))
  $$;
--> statement-breakpoint
-- Who may read a subject's wrapped key: the subject, a guardian, or anyone
-- holding an active grant from that subject or over that child. The wrapped
-- key is useless without the KEK, and the API decrypts only fields a policy
-- already let through.
CREATE FUNCTION can_use_key(subject_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT can_use_key.subject_id = current_actor()
        OR is_guardian(can_use_key.subject_id)
        OR EXISTS (
             SELECT 1 FROM grants g
             WHERE g.grantee_id = current_actor()
               AND g.revoked_at IS NULL
               AND CASE WHEN g.category = 'child'
                        THEN g.child_id = can_use_key.subject_id
                        ELSE g.owner_id = can_use_key.subject_id
                   END
           )
  $$;
--> statement-breakpoint
-- A person the actor has a relationship with, for reading a profile row:
-- an active grant in either direction, an active membership of the same
-- household, or guardianship of the same child.
CREATE FUNCTION is_related(other_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  SET app.policy_helper = 'on'
  AS $$
    SELECT EXISTS (
             SELECT 1 FROM grants g
             WHERE g.revoked_at IS NULL
               AND ((g.owner_id = current_actor() AND g.grantee_id = is_related.other_id)
                    OR (g.grantee_id = current_actor() AND g.owner_id = is_related.other_id))
           )
        OR EXISTS (
             SELECT 1 FROM household_members mine
             JOIN household_members theirs ON theirs.household_id = mine.household_id
             WHERE mine.user_id = current_actor()
               AND mine.status = 'active'
               AND theirs.user_id = is_related.other_id
               AND theirs.status = 'active'
           )
        OR EXISTS (
             SELECT 1 FROM child_guardians mine
             JOIN child_guardians theirs ON theirs.child_id = mine.child_id
             WHERE mine.user_id = current_actor()
               AND theirs.user_id = is_related.other_id
           )
  $$;
--> statement-breakpoint
-- Indexes the policies lean on that B2 to B7 did not add.
CREATE INDEX due_date_changes_subject_idx ON due_date_changes (subject_id);
--> statement-breakpoint
CREATE INDEX photos_child_idx ON photos (child_id) WHERE child_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX invitations_invitee_email_idx ON invitations (lower(invitee_email));
--> statement-breakpoint
-- FORCE binds the table owner to the policies as well, so nothing outside
-- withActor() or withSystem() reads or writes user data.
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subject_keys FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE households FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE household_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE grants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE consents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cycle_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE entry_symptoms FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cycle_predictions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pregnancies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pregnancy_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE due_date_changes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE children FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE child_guardians FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE child_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE child_measurements FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE photos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE photo_variants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE data_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE disclosures FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- profiles: the person, plus anyone related to her may read the row (the
-- API projects display name and time zone for them).
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (is_system() OR user_id = current_actor() OR is_related(user_id));
--> statement-breakpoint
CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (is_system() OR user_id = current_actor());
--> statement-breakpoint
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (is_system() OR user_id = current_actor())
  WITH CHECK (is_system() OR user_id = current_actor());
--> statement-breakpoint
CREATE POLICY profiles_delete ON profiles FOR DELETE
  USING (is_system() OR user_id = current_actor());
--> statement-breakpoint

-- subject_keys: readable by whoever may decrypt the subject's fields;
-- written by the subject, a guardian, or the system (the sign-up hook).
CREATE POLICY subject_keys_select ON subject_keys FOR SELECT
  USING (is_system() OR can_use_key(subject_id));
--> statement-breakpoint
CREATE POLICY subject_keys_insert ON subject_keys FOR INSERT
  WITH CHECK (is_system() OR subject_id = current_actor() OR is_guardian(subject_id));
--> statement-breakpoint
CREATE POLICY subject_keys_update ON subject_keys FOR UPDATE
  USING (is_system() OR subject_id = current_actor() OR is_guardian(subject_id))
  WITH CHECK (is_system() OR subject_id = current_actor() OR is_guardian(subject_id));
--> statement-breakpoint
CREATE POLICY subject_keys_delete ON subject_keys FOR DELETE
  USING (is_system() OR subject_id = current_actor() OR is_guardian(subject_id));
--> statement-breakpoint

-- households: members read; any signed-in actor creates one and becomes
-- its owner through the first membership row; the owner changes or ends it.
CREATE POLICY households_select ON households FOR SELECT
  USING (is_system() OR is_household_member(id));
--> statement-breakpoint
CREATE POLICY households_insert ON households FOR INSERT
  WITH CHECK (is_system() OR current_actor() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY households_update ON households FOR UPDATE
  USING (is_system() OR is_household_member(id, 'owner'))
  WITH CHECK (is_system() OR is_household_member(id, 'owner'));
--> statement-breakpoint
CREATE POLICY households_delete ON households FOR DELETE
  USING (is_system() OR is_household_member(id, 'owner'));
--> statement-breakpoint

-- household_members: members see each other; a membership is the creator's
-- owner row on an empty household or an invitee joining in the invited
-- role; a member ends her own membership (the new row must keep her
-- household and role, which the helper reads from the statement's
-- snapshot) and the owner changes or ends anyone's.
CREATE POLICY household_members_select ON household_members FOR SELECT
  USING (is_system() OR in_policy_helper() OR user_id = current_actor()
         OR is_household_member(household_id));
--> statement-breakpoint
CREATE POLICY household_members_insert ON household_members FOR INSERT
  WITH CHECK (is_system()
              OR (user_id = current_actor() AND status = 'active'
                  AND ((role = 'owner' AND NOT has_members(household_id))
                       OR may_join(household_id, role::text))));
--> statement-breakpoint
CREATE POLICY household_members_update ON household_members FOR UPDATE
  USING (is_system() OR user_id = current_actor() OR is_household_member(household_id, 'owner'))
  WITH CHECK (is_system()
              OR is_household_member(household_id, 'owner')
              OR (user_id = current_actor() AND is_household_member(household_id, role::text)));
--> statement-breakpoint
CREATE POLICY household_members_delete ON household_members FOR DELETE
  USING (is_system() OR is_household_member(household_id, 'owner'));
--> statement-breakpoint

-- invitations: the inviter and the owner see and withdraw them, and only
-- the owner of the household the row names may change one; the invitee,
-- matched by her verified email, reads hers and closes it through
-- accept_invitation(), which is why the marker is in the update policy.
CREATE POLICY invitations_select ON invitations FOR SELECT
  USING (is_system() OR in_policy_helper() OR inviter_id = current_actor()
         OR is_household_member(household_id, 'owner')
         OR lower(invitee_email) = actor_email());
--> statement-breakpoint
CREATE POLICY invitations_insert ON invitations FOR INSERT
  WITH CHECK (is_system()
              OR (inviter_id = current_actor() AND is_household_member(household_id, 'owner')));
--> statement-breakpoint
CREATE POLICY invitations_update ON invitations FOR UPDATE
  USING (is_system() OR in_policy_helper() OR inviter_id = current_actor()
         OR is_household_member(household_id, 'owner'))
  WITH CHECK (is_system() OR in_policy_helper()
              OR is_household_member(household_id, 'owner'));
--> statement-breakpoint
CREATE POLICY invitations_delete ON invitations FOR DELETE
  USING (is_system() OR inviter_id = current_actor()
         OR is_household_member(household_id, 'owner'));
--> statement-breakpoint

-- grants: both parties see a grant; only the owner makes one, and a child
-- grant only by a guardian of that child; the owner or a co-guardian
-- revokes (an update); only the owner removes the row.
CREATE POLICY grants_select ON grants FOR SELECT
  USING (is_system() OR in_policy_helper() OR owner_id = current_actor()
         OR grantee_id = current_actor());
--> statement-breakpoint
CREATE POLICY grants_insert ON grants FOR INSERT
  WITH CHECK (is_system()
              OR (owner_id = current_actor() AND (child_id IS NULL OR is_guardian(child_id))));
--> statement-breakpoint
CREATE POLICY grants_update ON grants FOR UPDATE
  USING (is_system() OR owner_id = current_actor()
         OR (child_id IS NOT NULL AND is_guardian(child_id)))
  WITH CHECK (is_system() OR owner_id = current_actor()
              OR (child_id IS NOT NULL AND is_guardian(child_id)));
--> statement-breakpoint
CREATE POLICY grants_delete ON grants FOR DELETE
  USING (is_system() OR owner_id = current_actor());
--> statement-breakpoint

-- consents: the subject, or a guardian consenting on a child's behalf and
-- recorded as such. Never a grantee.
CREATE POLICY consents_select ON consents FOR SELECT
  USING (is_system() OR subject_id = current_actor() OR is_guardian(subject_id));
--> statement-breakpoint
CREATE POLICY consents_insert ON consents FOR INSERT
  WITH CHECK (is_system() OR subject_id = current_actor()
              OR (is_guardian(subject_id) AND consenting_guardian_id = current_actor()));
--> statement-breakpoint
CREATE POLICY consents_update ON consents FOR UPDATE
  USING (is_system() OR subject_id = current_actor() OR is_guardian(subject_id))
  WITH CHECK (is_system() OR subject_id = current_actor() OR is_guardian(subject_id));
--> statement-breakpoint
CREATE POLICY consents_delete ON consents FOR DELETE
  USING (is_system() OR subject_id = current_actor() OR is_guardian(subject_id));
--> statement-breakpoint

-- cycle_entries: the one row that spans two categories (date and flow are
-- history, mood is a symptom); either grant reaches the row and the API
-- projects the columns.
CREATE POLICY cycle_entries_select ON cycle_entries FOR SELECT
  USING (is_system() OR can_read(subject_id, 'cycle.history')
         OR can_read(subject_id, 'cycle.symptoms'));
--> statement-breakpoint
CREATE POLICY cycle_entries_insert ON cycle_entries FOR INSERT
  WITH CHECK (is_system() OR can_write(subject_id, 'cycle.history')
              OR can_write(subject_id, 'cycle.symptoms'));
--> statement-breakpoint
CREATE POLICY cycle_entries_update ON cycle_entries FOR UPDATE
  USING (is_system() OR can_write(subject_id, 'cycle.history')
         OR can_write(subject_id, 'cycle.symptoms'))
  WITH CHECK (is_system() OR can_write(subject_id, 'cycle.history')
              OR can_write(subject_id, 'cycle.symptoms'));
--> statement-breakpoint
CREATE POLICY cycle_entries_delete ON cycle_entries FOR DELETE
  USING (is_system() OR subject_id = current_actor());
--> statement-breakpoint

CREATE POLICY entry_symptoms_select ON entry_symptoms FOR SELECT
  USING (is_system() OR can_read(subject_id, 'cycle.symptoms'));
--> statement-breakpoint
CREATE POLICY entry_symptoms_insert ON entry_symptoms FOR INSERT
  WITH CHECK (is_system() OR can_write(subject_id, 'cycle.symptoms'));
--> statement-breakpoint
CREATE POLICY entry_symptoms_update ON entry_symptoms FOR UPDATE
  USING (is_system() OR can_write(subject_id, 'cycle.symptoms'))
  WITH CHECK (is_system() OR can_write(subject_id, 'cycle.symptoms'));
--> statement-breakpoint
CREATE POLICY entry_symptoms_delete ON entry_symptoms FOR DELETE
  USING (is_system() OR subject_id = current_actor());
--> statement-breakpoint

-- cycle_predictions are regenerated in the writer's transaction, so a
-- contributor who logs a period may write them too.
CREATE POLICY cycle_predictions_select ON cycle_predictions FOR SELECT
  USING (is_system() OR can_read(subject_id, 'cycle.history'));
--> statement-breakpoint
CREATE POLICY cycle_predictions_insert ON cycle_predictions FOR INSERT
  WITH CHECK (is_system() OR can_write(subject_id, 'cycle.history'));
--> statement-breakpoint
CREATE POLICY cycle_predictions_update ON cycle_predictions FOR UPDATE
  USING (is_system() OR can_write(subject_id, 'cycle.history'))
  WITH CHECK (is_system() OR can_write(subject_id, 'cycle.history'));
--> statement-breakpoint
CREATE POLICY cycle_predictions_delete ON cycle_predictions FOR DELETE
  USING (is_system() OR subject_id = current_actor());
--> statement-breakpoint

CREATE POLICY pregnancies_select ON pregnancies FOR SELECT
  USING (is_system() OR can_read(subject_id, 'pregnancy.overview'));
--> statement-breakpoint
CREATE POLICY pregnancies_insert ON pregnancies FOR INSERT
  WITH CHECK (is_system() OR can_write(subject_id, 'pregnancy.overview'));
--> statement-breakpoint
CREATE POLICY pregnancies_update ON pregnancies FOR UPDATE
  USING (is_system() OR can_write(subject_id, 'pregnancy.overview'))
  WITH CHECK (is_system() OR can_write(subject_id, 'pregnancy.overview'));
--> statement-breakpoint
CREATE POLICY pregnancies_delete ON pregnancies FOR DELETE
  USING (is_system() OR subject_id = current_actor());
--> statement-breakpoint

CREATE POLICY pregnancy_events_select ON pregnancy_events FOR SELECT
  USING (is_system() OR can_read(subject_id, 'pregnancy.overview'));
--> statement-breakpoint
CREATE POLICY pregnancy_events_insert ON pregnancy_events FOR INSERT
  WITH CHECK (is_system() OR can_write(subject_id, 'pregnancy.overview'));
--> statement-breakpoint
CREATE POLICY pregnancy_events_update ON pregnancy_events FOR UPDATE
  USING (is_system() OR can_write(subject_id, 'pregnancy.overview'))
  WITH CHECK (is_system() OR can_write(subject_id, 'pregnancy.overview'));
--> statement-breakpoint
CREATE POLICY pregnancy_events_delete ON pregnancy_events FOR DELETE
  USING (is_system() OR subject_id = current_actor());
--> statement-breakpoint

-- due_date_changes: an append-only log she alone reads (storage map 8.2);
-- a contributor who changes the due date may append to it.
CREATE POLICY due_date_changes_select ON due_date_changes FOR SELECT
  USING (is_system() OR subject_id = current_actor());
--> statement-breakpoint
CREATE POLICY due_date_changes_insert ON due_date_changes FOR INSERT
  WITH CHECK (is_system() OR can_write(subject_id, 'pregnancy.overview'));
--> statement-breakpoint
CREATE POLICY due_date_changes_update ON due_date_changes FOR UPDATE
  USING (is_system())
  WITH CHECK (is_system());
--> statement-breakpoint
CREATE POLICY due_date_changes_delete ON due_date_changes FOR DELETE
  USING (is_system() OR subject_id = current_actor());
--> statement-breakpoint

-- children: the child is the subject of its own row; an active member of
-- the household creates one; guardians, or a contributor, edit it in
-- place, and only a guardian moves it, into a household she belongs to; a
-- guardian removes it. Membership alone shows nothing (8.1).
CREATE POLICY children_select ON children FOR SELECT
  USING (is_system() OR in_policy_helper() OR can_read(id, 'child'));
--> statement-breakpoint
CREATE POLICY children_insert ON children FOR INSERT
  WITH CHECK (is_system() OR is_household_member(household_id));
--> statement-breakpoint
CREATE POLICY children_update ON children FOR UPDATE
  USING (is_system() OR can_write(id, 'child'))
  WITH CHECK (is_system()
              OR (can_write(id, 'child') AND household_id = child_household(id))
              OR (is_guardian(id) AND is_household_member(household_id)));
--> statement-breakpoint
CREATE POLICY children_delete ON children FOR DELETE
  USING (is_system() OR is_guardian(id));
--> statement-breakpoint

-- child_guardians: guardians see each other; the creator (a member of the
-- child's household) becomes the first guardian, after that only a
-- guardian adds one; a guardian steps down or removes another.
CREATE POLICY child_guardians_select ON child_guardians FOR SELECT
  USING (is_system() OR in_policy_helper() OR user_id = current_actor()
         OR is_guardian(child_id));
--> statement-breakpoint
CREATE POLICY child_guardians_insert ON child_guardians FOR INSERT
  WITH CHECK (is_system() OR is_guardian(child_id)
              OR (user_id = current_actor() AND NOT has_guardian(child_id)
                  AND is_household_member(child_household(child_id))));
--> statement-breakpoint
CREATE POLICY child_guardians_update ON child_guardians FOR UPDATE
  USING (is_system() OR is_guardian(child_id))
  WITH CHECK (is_system() OR is_guardian(child_id));
--> statement-breakpoint
CREATE POLICY child_guardians_delete ON child_guardians FOR DELETE
  USING (is_system() OR user_id = current_actor() OR is_guardian(child_id));
--> statement-breakpoint

CREATE POLICY child_events_select ON child_events FOR SELECT
  USING (is_system() OR can_read(child_id, 'child'));
--> statement-breakpoint
CREATE POLICY child_events_insert ON child_events FOR INSERT
  WITH CHECK (is_system() OR can_write(child_id, 'child'));
--> statement-breakpoint
CREATE POLICY child_events_update ON child_events FOR UPDATE
  USING (is_system() OR can_write(child_id, 'child'))
  WITH CHECK (is_system() OR can_write(child_id, 'child'));
--> statement-breakpoint
CREATE POLICY child_events_delete ON child_events FOR DELETE
  USING (is_system() OR is_guardian(child_id));
--> statement-breakpoint

CREATE POLICY child_measurements_select ON child_measurements FOR SELECT
  USING (is_system() OR can_read(child_id, 'child'));
--> statement-breakpoint
CREATE POLICY child_measurements_insert ON child_measurements FOR INSERT
  WITH CHECK (is_system() OR can_write(child_id, 'child'));
--> statement-breakpoint
CREATE POLICY child_measurements_update ON child_measurements FOR UPDATE
  USING (is_system() OR can_write(child_id, 'child'))
  WITH CHECK (is_system() OR can_write(child_id, 'child'));
--> statement-breakpoint
CREATE POLICY child_measurements_delete ON child_measurements FOR DELETE
  USING (is_system() OR is_guardian(child_id));
--> statement-breakpoint

-- notes: the row's own category decides; journal.private never leaves the
-- subject, and nobody but her can file a note there.
CREATE POLICY notes_select ON notes FOR SELECT
  USING (is_system() OR can_read(subject_id, category::text));
--> statement-breakpoint
CREATE POLICY notes_insert ON notes FOR INSERT
  WITH CHECK (is_system() OR can_write(subject_id, category::text));
--> statement-breakpoint
CREATE POLICY notes_update ON notes FOR UPDATE
  USING (is_system() OR can_write(subject_id, category::text))
  WITH CHECK (is_system() OR can_write(subject_id, category::text));
--> statement-breakpoint
CREATE POLICY notes_delete ON notes FOR DELETE
  USING (is_system() OR subject_id = current_actor());
--> statement-breakpoint

-- photos: the subject is her or a child; child_id names the child, and the
-- row's category follows the subject.
CREATE POLICY photos_select ON photos FOR SELECT
  USING (is_system() OR can_read(coalesce(child_id, subject_id), category::text));
--> statement-breakpoint
CREATE POLICY photos_insert ON photos FOR INSERT
  WITH CHECK (is_system() OR can_write(coalesce(child_id, subject_id), category::text));
--> statement-breakpoint
CREATE POLICY photos_update ON photos FOR UPDATE
  USING (is_system() OR can_write(coalesce(child_id, subject_id), category::text))
  WITH CHECK (is_system() OR can_write(coalesce(child_id, subject_id), category::text));
--> statement-breakpoint
CREATE POLICY photos_delete ON photos FOR DELETE
  USING (is_system() OR subject_id = current_actor()
         OR (child_id IS NOT NULL AND is_guardian(child_id)));
--> statement-breakpoint

-- photo_variants follow their photo: visible with it, written by whoever
-- may write it (in practice the variant job, as system), removed with it.
CREATE POLICY photo_variants_select ON photo_variants FOR SELECT
  USING (is_system() OR EXISTS (SELECT 1 FROM photos p WHERE p.id = photo_variants.photo_id));
--> statement-breakpoint
CREATE POLICY photo_variants_insert ON photo_variants FOR INSERT
  WITH CHECK (is_system() OR EXISTS (
    SELECT 1 FROM photos p
    WHERE p.id = photo_variants.photo_id
      AND can_write(coalesce(p.child_id, p.subject_id), p.category::text)));
--> statement-breakpoint
CREATE POLICY photo_variants_update ON photo_variants FOR UPDATE
  USING (is_system() OR EXISTS (
    SELECT 1 FROM photos p
    WHERE p.id = photo_variants.photo_id
      AND can_write(coalesce(p.child_id, p.subject_id), p.category::text)))
  WITH CHECK (is_system() OR EXISTS (
    SELECT 1 FROM photos p
    WHERE p.id = photo_variants.photo_id
      AND can_write(coalesce(p.child_id, p.subject_id), p.category::text)));
--> statement-breakpoint
CREATE POLICY photo_variants_delete ON photo_variants FOR DELETE
  USING (is_system() OR EXISTS (
    SELECT 1 FROM photos p
    WHERE p.id = photo_variants.photo_id
      AND (p.subject_id = current_actor()
           OR (p.child_id IS NOT NULL AND is_guardian(p.child_id)))));
--> statement-breakpoint

-- audit_events: the subject (or a child's guardian) sees who touched the
-- records, the actor sees her own actions; an actor appends only as
-- herself and only about a subject she holds a key relationship to
-- (herself, a child she guards, a person who granted to her, or that
-- child); the log is never edited and only the sweep removes rows.
CREATE POLICY audit_events_select ON audit_events FOR SELECT
  USING (is_system() OR subject_id = current_actor() OR actor_id = current_actor()
         OR is_guardian(subject_id));
--> statement-breakpoint
CREATE POLICY audit_events_insert ON audit_events FOR INSERT
  WITH CHECK (is_system() OR (actor_id = current_actor() AND can_use_key(subject_id)));
--> statement-breakpoint
CREATE POLICY audit_events_update ON audit_events FOR UPDATE
  USING (is_system())
  WITH CHECK (is_system());
--> statement-breakpoint
CREATE POLICY audit_events_delete ON audit_events FOR DELETE
  USING (is_system());
--> statement-breakpoint

-- data_requests: a person sees and files her own; a request keyed only by
-- email_hmac comes through the public inbox, as system; she may cancel a
-- closure inside its window; only the system closes a request.
CREATE POLICY data_requests_select ON data_requests FOR SELECT
  USING (is_system() OR user_id = current_actor());
--> statement-breakpoint
CREATE POLICY data_requests_insert ON data_requests FOR INSERT
  WITH CHECK (is_system() OR user_id = current_actor());
--> statement-breakpoint
CREATE POLICY data_requests_update ON data_requests FOR UPDATE
  USING (is_system() OR user_id = current_actor())
  WITH CHECK (is_system() OR user_id = current_actor());
--> statement-breakpoint
CREATE POLICY data_requests_delete ON data_requests FOR DELETE
  USING (is_system());
--> statement-breakpoint

-- disclosures: the person reads her ledger; the product writes it.
CREATE POLICY disclosures_select ON disclosures FOR SELECT
  USING (is_system() OR user_id = current_actor());
--> statement-breakpoint
CREATE POLICY disclosures_insert ON disclosures FOR INSERT
  WITH CHECK (is_system());
--> statement-breakpoint
CREATE POLICY disclosures_update ON disclosures FOR UPDATE
  USING (is_system())
  WITH CHECK (is_system());
--> statement-breakpoint
CREATE POLICY disclosures_delete ON disclosures FOR DELETE
  USING (is_system());
