UPDATE atlas_inbox_items
SET
  read_state = 'Read'
WHERE
  id = $1
  AND (
    recipient_user_id = $2
    OR (
      recipient_user_id IS NULL
      AND lower(recipient_username) = lower($3)
    )
  )
RETURNING
  id,
  read_state AS "readState"
