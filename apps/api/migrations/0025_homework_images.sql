ALTER TABLE assignments ADD COLUMN image_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN submitted_images TEXT NOT NULL DEFAULT '{}';

CREATE TABLE homework_images (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  course_id TEXT NOT NULL REFERENCES courses (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  -- NULL for a teacher's course upload, which may precede creation of the assignment.
  assignment_id TEXT REFERENCES assignments (id),
  student_id TEXT REFERENCES students (id),
  content_type TEXT NOT NULL,
  check_at TEXT NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0,
  deleting INTEGER NOT NULL DEFAULT 0,
  CHECK ((assignment_id IS NULL) = (student_id IS NULL))
);
CREATE INDEX idx_homework_images_cleanup ON homework_images (check_at);

-- Includes student drafts so their photos survive the same way as their written answers.
CREATE VIEW homework_image_references AS
  SELECT a.tenant_id, a.course_id, a.id AS assignment_id, NULL AS student_id, j.value AS image_id
  FROM assignments a, json_each(a.image_ids) j
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
