SELECT
  id,
  body,
  actor_context AS "actorContext",
  actor_user_id AS "actorUserId",
  actor_username AS "actorUsername",
  authenticated_actor_user_id AS "authenticatedActorUserId",
  authenticated_actor_username AS "authenticatedActorUsername",
  created_at AS "createdAt"
FROM
  atlas_audit_discussion_messages
WHERE
  thread_id = $1
ORDER BY
  id
