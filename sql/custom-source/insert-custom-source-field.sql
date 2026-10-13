INSERT INTO atlas_custom_source_fields (
  id,
  source_id,
  field_order,
  field_name,
  vanity_label,
  field_format,
  business_description
)
VALUES
  ($1, $2, $3, $4, $5, $6, $7)
