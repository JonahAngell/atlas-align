SELECT
  count(*)::int AS "unreadCount"
FROM
  atlas_inbox_items
WHERE
  read_state = 'Unread'
  AND (
    recipient_user_id = $1
    OR (
      recipient_user_id IS NULL
      AND lower(recipient_username) = lower($2)
    )
  )
