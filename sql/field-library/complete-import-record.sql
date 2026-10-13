UPDATE atlas_field_library_imports
SET
  status = 'succeeded',
  completed_at = current_timestamp
WHERE
  id = $1
