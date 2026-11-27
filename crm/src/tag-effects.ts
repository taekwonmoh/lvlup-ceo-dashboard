/**
 * Tag writes for staff bulk actions, task completion, and automation steps.
 * A dry-run automation records the intent and does not insert entity_tags.
 */
import type { Sql } from './query.ts';

export type TagSubject = {
  memberId?: string | null;
  leadId?: string | null;
  familyId?: string | null;
};

export type TagIntent = {
  applied: boolean;
  tagId: string | null;
  reason: 'dry_run' | 'applied' | 'unknown_tag' | 'no_subject';
};

function oneSubject(input: TagSubject): { memberId: string | null; leadId: string | null; familyId: string | null } | null {
  if (input.memberId) return { memberId: input.memberId, leadId: null, familyId: null };
  if (input.leadId) return { memberId: null, leadId: input.leadId, familyId: null };
  if (input.familyId) return { memberId: null, leadId: null, familyId: input.familyId };
  return null;
}

async function findTag(db: Sql, tagName: string, locationId: string): Promise<string | null> {
  const row = await db.query(
    `select id from tags
     where lower(name) = lower($1)
       and archived = false
       and (location_id = $2 or location_id is null)
     order by (location_id is null), id
     limit 1`,
    [tagName, locationId],
  );
  return row.rows[0]?.id ? String(row.rows[0].id) : null;
}

export async function recordAutomationTag(db: Sql, input: {
  dryRun: boolean;
  op: 'add' | 'remove';
  tagName: string;
  locationId: string;
  memberId?: string | null;
  leadId?: string | null;
  familyId?: string | null;
  addedBy?: string | null;
}): Promise<TagIntent> {
  const name = String(input.tagName || '').trim();
  const subject = oneSubject(input);
  if (!name || !subject) return { applied: false, tagId: null, reason: 'no_subject' };
  const tagId = await findTag(db, name, input.locationId);
  if (input.dryRun) return { applied: false, tagId, reason: 'dry_run' };
  if (!tagId) return { applied: false, tagId: null, reason: 'unknown_tag' };
  await writeTag(db, {
    op: input.op,
    tagId,
    subject,
    addedBy: input.addedBy || null,
    source: 'automation',
  });
  return { applied: true, tagId, reason: 'applied' };
}

export async function writeTag(db: Sql, input: {
  op: 'add' | 'remove';
  tagId: string;
  subject: { memberId: string | null; leadId: string | null; familyId: string | null };
  addedBy: string | null;
  source: 'staff' | 'automation' | 'bulk' | 'task' | 'form';
}) {
  const { memberId, leadId, familyId } = input.subject;
  if (input.op === 'remove') {
    await db.query(
      `delete from entity_tags
       where tag_id = $1
         and member_id is not distinct from $2
         and lead_id is not distinct from $3
         and family_id is not distinct from $4`,
      [input.tagId, memberId, leadId, familyId],
    );
    return;
  }
  await db.query(
    `insert into entity_tags (tag_id, member_id, lead_id, family_id, added_by, source)
     values ($1, $2, $3, $4, $5, $6)
     on conflict do nothing`,
    [input.tagId, memberId, leadId, familyId, input.addedBy, input.source],
  );
}

export async function applyTaskTags(db: Sql, input: {
  memberId?: string | null;
  leadId?: string | null;
  familyId?: string | null;
  tagIdsAdd: string[];
  tagIdsRemove: string[];
  addedBy?: string | null;
  dryRun?: boolean;
}): Promise<{ applied: boolean; reason: 'dry_run' | 'applied' | 'no_subject' }> {
  const subject = oneSubject(input);
  if (!subject) return { applied: false, reason: 'no_subject' };
  if (input.dryRun) return { applied: false, reason: 'dry_run' };
  for (const tagId of input.tagIdsRemove) {
    await writeTag(db, { op: 'remove', tagId, subject, addedBy: input.addedBy || null, source: 'task' });
  }
  for (const tagId of input.tagIdsAdd) {
    await writeTag(db, { op: 'add', tagId, subject, addedBy: input.addedBy || null, source: 'task' });
  }
  return { applied: true, reason: 'applied' };
}
