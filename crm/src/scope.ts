/** Dashboard tiers for the CRM API. Firebase `staff.role` stays admin or staff. */

export const PLATFORM_ROLES = ['owner', 'school_lead', 'front_desk', 'coach', 'ops', 'family'] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export function isPlatformRole(value: string): value is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(value);
}

export function platformRoleOf(actor: { role: string; platformRole?: string | null }): PlatformRole {
  if (actor.platformRole && isPlatformRole(actor.platformRole)) return actor.platformRole;
  if (actor.role === 'admin') return 'owner';
  if (actor.role === 'guardian' || actor.role === 'member') return 'family';
  return 'school_lead';
}

export function canApproveHolds(role: PlatformRole) {
  return role === 'owner' || role === 'school_lead';
}

export function seesAllSchools(role: PlatformRole) {
  return role === 'owner';
}

export function isStaffRole(role: PlatformRole) {
  return role !== 'family';
}
