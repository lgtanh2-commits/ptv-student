export interface HomeworkImageRow {
  id: string;
  tenant_id: string;
  course_id: string;
  user_id: string;
  assignment_id: string | null;
  student_id: string | null;
  content_type: string;
  check_at: string;
}

export const insertHomeworkImage = (db: D1Database, row: HomeworkImageRow) =>
  db
    .prepare(
      `INSERT INTO homework_images (id, tenant_id, course_id, user_id, assignment_id, student_id, content_type, check_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.tenant_id,
      row.course_id,
      row.user_id,
      row.assignment_id,
      row.student_id,
      row.content_type,
      row.check_at,
    )
    .run();

export const markHomeworkImageReady = (db: D1Database, id: string) =>
  db.prepare("UPDATE homework_images SET ready = 1 WHERE id = ? AND deleting = 0").bind(id).run();

export const findHomeworkImage = (db: D1Database, id: string) =>
  db
    .prepare("SELECT * FROM homework_images WHERE id = ? AND ready = 1 AND deleting = 0")
    .bind(id)
    .first<HomeworkImageRow>();

/** Claim before touching R2, so an attachment cannot be saved while its object is being removed. */
export const claimUnusedImages = (db: D1Database, now: string, recheckAt: string) =>
  db
    .prepare(
      `WITH candidates AS MATERIALIZED (
       SELECT i.id, (i.deleting = 1 OR NOT EXISTS (
         SELECT 1 FROM homework_image_references r
         WHERE r.tenant_id = i.tenant_id AND r.course_id = i.course_id AND r.image_id = i.id
           AND (i.assignment_id IS NULL OR (r.assignment_id = i.assignment_id AND r.student_id = i.student_id))
       )) AS should_delete
       FROM homework_images i WHERE i.check_at <= ?1 ORDER BY i.check_at LIMIT 50
     )
     UPDATE homework_images
     SET deleting = candidates.should_delete, check_at = CASE WHEN candidates.should_delete THEN ?1 ELSE ?2 END
     FROM candidates WHERE homework_images.id = candidates.id
     RETURNING id, deleting`,
    )
    .bind(now, recheckAt)
    .all<{ id: string; deleting: number }>();

export const finishImageDeletion = (db: D1Database, ids: string[]) =>
  db
    .prepare("DELETE FROM homework_images WHERE deleting = 1 AND id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids))
    .run();
