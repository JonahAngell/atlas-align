SELECT
  id,
  from_state AS "fromState",
  to_state AS "toState",
  actor_user_id AS "actorUserId",
  actor_username AS "actorUsername",
  authenticated_actor_user_id AS "authenticatedActorUserId",
  authenticated_actor_username AS "authenticatedActorUsername",
  created_at AS "createdAt"
FROM
  atlas_audit_discussion_transitions
WHERE
  thread_id = $1
ORDER BY
  id
