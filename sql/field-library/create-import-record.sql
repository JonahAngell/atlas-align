INSERT INTO
  atlas_field_library_imports (
    original_file_name,
    row_count,
    file_sha256,
    imported_by,
    imported_by_user_id,
    imported_by_username,
    imported_by_full_name,
    imported_by_email,
    status
  )
VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, 'processing')
RETURNING
  id
