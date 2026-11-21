/** Map a Firebase task-sheet snapshot into CRM rows. Does not write Firebase. */

export type TaskDef = {
  id: string;
  cadence: 'daily' | 'weekly' | 'cycle' | 'monthly';
  title: string;
  seatId?: string | null;
  locationId?: string | null;
  days?: number[] | null;
  proofKind?: string | null;
  linksMember?: boolean;
};

export type FirebaseCompletion = {
  ts?: number;
  proofV?: number;
  note?: string;
  photos?: string[];
  burst?: boolean;
  memberId?: string | null;
};

export type FirebaseTaskExport = {
  empId: string;
  clockStaffId: string;
  locationId?: string | null;
  daily?: Record<string, Record<string, FirebaseCompletion>>;
  weekly?: Record<string, Record<string, FirebaseCompletion>>;
  monthly?: Record<string, Record<string, FirebaseCompletion>>;
  cycle?: Record<string, Record<string, FirebaseCompletion>>;
};

export type TaskCompletionRow = {
  taskId: string;
  clockStaffId: string;
  locationId: string | null;
  periodKey: string;
  cadence: TaskDef['cadence'];
  memberId: string | null;
  status: 'done' | 'needs_review';
  proof: Record<string, unknown>;
  firebasePath: string;
  completedAt: string | null;
};

const CADENCE_KEY = { daily: 'daily', weekly: 'weekly', monthly: 'monthly', cycle: 'cycle' } as const;

export function taskDueOnDate(def: { id: string; days?: number[] | null }, dateKey: string) {
  const dow = new Date(dateKey + 'T12:00:00').getDay();
  if (def.days && def.days.length && !def.days.includes(dow)) return false;
  if (dow === 6 && (def.id === 'spray_mats' || def.id === 'j_spray')) return false;
  return true;
}

export function completionsFromFirebase(exp: FirebaseTaskExport): TaskCompletionRow[] {
  const out: TaskCompletionRow[] = [];
  const sections: [TaskDef['cadence'], Record<string, Record<string, FirebaseCompletion>> | undefined][] = [
    ['daily', exp.daily],
    ['weekly', exp.weekly],
    ['monthly', exp.monthly],
    ['cycle', exp.cycle],
  ];
  for (const [cadence, bucket] of sections) {
    if (!bucket) continue;
    for (const [period, tasks] of Object.entries(bucket)) {
      for (const [taskId, rec] of Object.entries(tasks || {})) {
        if (!rec || rec.proofV == null && rec.ts == null) continue;
        out.push({
          taskId,
          clockStaffId: exp.clockStaffId,
          locationId: exp.locationId || null,
          periodKey: period,
          cadence,
          memberId: rec.memberId || null,
          status: rec.burst ? 'needs_review' : 'done',
          proof: {
            proofV: rec.proofV ?? null,
            note: rec.note || null,
            photoCount: Array.isArray(rec.photos) ? rec.photos.length : 0,
          },
          firebasePath: `ceo/tasks/emp/${exp.empId}/${CADENCE_KEY[cadence]}/${period}/${taskId}`,
          completedAt: rec.ts ? new Date(rec.ts).toISOString() : null,
        });
      }
    }
  }
  return out;
}
