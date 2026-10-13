SELECT
  s.id,
  s.source_key,
  s.source_name,
  s.source_system,
  s.created_by_user_id,
  s.created_by_username,
  s.created_by_full_name,
  NULLIF(btrim(p.avatar_url), '') AS avatar_url,
  COALESCE(
    json_agg(
      json_build_object(
        'id', f.id,
        'field_order', f.field_order,
        'field_name', f.field_name,
        'vanity_label', f.vanity_label,
        'field_format', f.field_format,
        'business_description', f.business_description
      )
      ORDER BY f.field_order
    ) FILTER (WHERE f.id IS NOT NULL),
    '[]'::json
  ) AS fields
FROM atlas_custom_sources AS s
LEFT JOIN atlas_custom_source_fields AS f
  ON f.source_id = s.id
LEFT JOIN atlas_user_profiles AS p
  ON p.user_id = s.created_by_user_id
GROUP BY
  s.id,
  p.avatar_url
ORDER BY
  s.source_name ASC,
  s.source_key ASC
