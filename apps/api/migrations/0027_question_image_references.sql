-- Track question attachments alongside assignment and submission attachments for R2 cleanup.
DROP VIEW homework_image_references;
CREATE VIEW homework_image_references AS
  SELECT a.tenant_id, a.course_id, a.id AS assignment_id, NULL AS student_id, j.value AS image_id
  FROM assignments a, json_each(a.image_ids) j
  WHERE a.deleted_at IS NULL
  UNION ALL
  SELECT a.tenant_id, a.course_id, a.id, NULL, photo.value
  FROM assignments a, json_each(a.questions) q, json_each(q.value, '$.imageIds') photo
  WHERE a.deleted_at IS NULL
  UNION ALL
  SELECT a.tenant_id, a.course_id, a.id, s.student_id, j.value
  FROM submissions s JOIN assignments a ON a.id = s.assignment_id,
    json_each(s.responses) answer, json_each(answer.value, '$.imageIds') j
  WHERE a.deleted_at IS NULL
  UNION ALL
  SELECT a.tenant_id, a.course_id, a.id, s.student_id, j.value
  FROM submissions s JOIN assignments a ON a.id = s.assignment_id,
    json_each(s.submitted_images) answer, json_each(answer.value) j
  WHERE a.deleted_at IS NULL AND s.status = 'revision_requested';
