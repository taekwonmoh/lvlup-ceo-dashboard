/**
 * Fixture files bundled with the Worker so the import routes match the Node server.
 * These are the repo fixtures (example.test), not a live roster.
 */
import membersCsv from '../../fixtures/gymdesk-members.csv';
import platformMembersCsv from '../../fixtures/platform/members.csv';
import platformPaymentsCsv from '../../fixtures/platform/payments.csv';
import cim from '../../fixtures/cim-profiles.json' with { type: 'json' };
import leadsFile from '../../fixtures/gymdesk-leads.json' with { type: 'json' };
import platformCim from '../../fixtures/platform/cim-profiles.json' with { type: 'json' };
import holdsFile from '../../fixtures/platform/holds.json' with { type: 'json' };
import waiversFile from '../../fixtures/platform/waivers.json' with { type: 'json' };
import tasksFile from '../../fixtures/firebase-tasks.json' with { type: 'json' };
import scheduleFile from '../../fixtures/firebase-schedule.json' with { type: 'json' };
import { parseMembersCsv, type CimProfile, type LeadRow } from '../../src/gymdesk.ts';
import type { FirebaseTaskExport } from '../../src/tasks.ts';
import type { ScheduleExport } from '../../src/schedule.ts';
import type { CrmLoaders } from './routes.ts';

export function workerLoaders(): CrmLoaders {
  return {
    async loadFixtures() {
      return {
        members: parseMembersCsv(membersCsv),
        profiles: (cim as { profiles: CimProfile[] }).profiles,
        leads: (leadsFile as { leads: LeadRow[] }).leads,
      };
    },
    async loadPlatformFixtures() {
      const cimProfiles = platformCim as { profiles: CimProfile[] };
      const holds = holdsFile as { holds: { memberId: string; startOn: string; endOn: string; reason: string }[] };
      const waivers = waiversFile as { waivers: { memberId: string; version: string; signedOn: string }[] };
      return {
        membersCsv: platformMembersCsv,
        paymentsCsv: platformPaymentsCsv,
        profiles: cimProfiles.profiles,
        holds: holds.holds,
        waivers: waivers.waivers,
      };
    },
    async loadTasks() {
      return tasksFile as FirebaseTaskExport;
    },
    async loadSchedule() {
      return scheduleFile as ScheduleExport;
    },
  };
}
