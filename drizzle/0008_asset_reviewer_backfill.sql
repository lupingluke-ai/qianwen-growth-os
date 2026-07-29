-- Existing submissions created before reviewer assignment was introduced remain
-- actionable by assigning the first eligible reviewer who is not the author.
UPDATE "assets" AS target
SET
  "reviewer_email" = candidate.email,
  "reviewer_name" = candidate.display_name
FROM (
  SELECT
    source.id,
    (
      SELECT wu.email
      FROM "workspace_users" AS wu
      WHERE wu.role IN ('reviewer', 'admin')
        AND wu.member_id <> source.owner_member_id
      ORDER BY CASE wu.role WHEN 'admin' THEN 1 ELSE 0 END, wu.created_at ASC
      LIMIT 1
    ) AS email,
    (
      SELECT wu.display_name
      FROM "workspace_users" AS wu
      WHERE wu.role IN ('reviewer', 'admin')
        AND wu.member_id <> source.owner_member_id
      ORDER BY CASE wu.role WHEN 'admin' THEN 1 ELSE 0 END, wu.created_at ASC
      LIMIT 1
    ) AS display_name
  FROM "assets" AS source
  WHERE source.review_status IN ('待审核', '待补充')
    AND COALESCE(source.reviewer_email, '') = ''
) AS candidate
WHERE target.id = candidate.id
  AND candidate.email IS NOT NULL;
