# Coach membership backfill and operations

## Authorization decision

Coach access is team-scoped and deny-by-default. The integrity migration creates a
membership only when a historical staff action can be joined to a team through a
reviewed workout/proof, weekly requirement, exemption, athlete override, or team
settings audit. `COACH`/`ADMIN` role, active status, and email-domain similarity
are not sufficient authorization evidence. `ADMIN` is therefore not implicitly
global.

The production preflight on 2026-09-12 found 15 active coaches, no active admins,
and two populated teams. Historical actions support five memberships, all on the
45-athlete operational team. Ten active coaches have no attributable action. One
of those accounts shares a unique non-public email domain with the two athletes
on the otherwise inactive team; that is a useful assignment-review clue, not a
safe automatic grant.

## Post-migration verification

Run these read-only queries as the database operator. Every account returned by
the first query needs an explicit product-owner disposition: grant exact team
membership or intentionally leave it without coach-route access.

```sql
SELECT
  coach.id AS "coachId",
  coach.email,
  coach.name,
  coach.role,
  coach."createdAt"
FROM "User" coach
WHERE coach.role IN ('COACH', 'ADMIN')
  AND coach.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM "CoachTeamMembership" membership
    WHERE membership."coachId" = coach.id
  )
ORDER BY coach."createdAt", coach.id;
```

Inspect the resulting access matrix before granting anything:

```sql
SELECT
  coach.email,
  team.name AS team,
  COUNT(profile.id)::int AS athletes
FROM "CoachTeamMembership" membership
JOIN "User" coach ON coach.id = membership."coachId"
JOIN "Team" team ON team.id = membership."teamId"
LEFT JOIN "AthleteProfile" profile ON profile."teamId" = team.id
GROUP BY coach.email, team.name
ORDER BY coach.email, team.name;
```

## Explicit assignment

Use exact IDs chosen by an authorized operator. This statement grants nothing if
the user is inactive or is not a coach/admin, and the foreign key rejects an
unknown team.

```sql
BEGIN;

INSERT INTO "CoachTeamMembership" ("teamId", "coachId")
SELECT :'team_id', staff.id
FROM "User" staff
WHERE staff.id = :'coach_id'
  AND staff.role IN ('COACH', 'ADMIN')
  AND staff.status = 'ACTIVE'
ON CONFLICT DO NOTHING;

SELECT membership."teamId", membership."coachId", membership."createdAt"
FROM "CoachTeamMembership" membership
WHERE membership."teamId" = :'team_id'
  AND membership."coachId" = :'coach_id';

COMMIT;
```

A zero-row verification result means no grant was made; correct the exact input
instead of trying a broader query. Revoke a mistaken grant with an exact-key delete:

```sql
DELETE FROM "CoachTeamMembership"
WHERE "teamId" = :'team_id' AND "coachId" = :'coach_id'
RETURNING "teamId", "coachId";
```

After assignments, repeat the unassigned-account query and test one authorized
and one cross-team-denied coach request.
