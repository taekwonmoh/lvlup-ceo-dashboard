/**
 * Wave 1 HTTP paths. dispatchCrm in the Worker calls this before the older routes.
 */
import type { Actor } from './auth.ts';
import { acceptLeadInvite, createForm, createLeadInvite, getPublicForm, listForms, orderFormPlans, patchForm, submitPublicForm } from './forms.ts';
import {
  bulkApplyTags,
  bulkMemberStatus,
  createManualLead,
  createNote,
  createStatus,
  createTag,
  listContacts,
  listNotes,
  listPeopleByTag,
  listStatuses,
  listTags,
  memberPhoto,
  patchNote,
  patchStatus,
  patchTag,
  pinNote,
  replaceContacts,
} from './profiles.ts';
import type { SqlPool } from './query.ts';

export type Wave1Env = { CRM_TOKEN_SECRET?: string };

export function isPublicWave1Path(method: string, parts: string[]): boolean {
  if (parts[0] !== 'v1' || parts[1] !== 'public') return false;
  if (parts[2] === 'forms' && parts[3]) return method === 'GET' || method === 'POST';
  if (parts[2] === 'invites' && parts[3] && parts[4] === 'accept') return method === 'POST';
  return false;
}

export function isStaffWave1Path(method: string, parts: string[], search: URLSearchParams): boolean {
  if (parts[0] !== 'v1') return false;
  const head = parts[1];
  if (head === 'members' && method === 'GET' && parts.length === 2 && search.has('tag')) return true;
  if (head === 'members' && method === 'POST' && parts[2] === 'bulk-status') return true;
  if (head === 'members' && parts[3] === 'notes') return method === 'GET' || method === 'POST' || method === 'PATCH';
  if (head === 'members' && parts[3] === 'photo') return method === 'GET' || method === 'POST';
  if (head === 'notes' && method === 'POST' && parts[3] === 'pin') return true;
  if (head === 'families' && parts[3] === 'contacts') return method === 'GET' || method === 'PUT';
  if (head === 'statuses') return method === 'GET' || method === 'POST' || method === 'PATCH';
  if (head === 'tags') return method === 'GET' || method === 'POST' || method === 'PATCH';
  if (head === 'forms') return method === 'GET' || method === 'POST' || method === 'PATCH' || method === 'PUT';
  if (head === 'leads' && method === 'POST' && parts.length === 2) return true;
  if (head === 'leads' && method === 'GET' && parts.length === 2 && search.has('tag')) return true;
  if (head === 'leads' && method === 'POST' && parts[3] === 'invites') return true;
  return false;
}

export async function handleWave1(input: {
  method: string;
  parts: string[];
  search: URLSearchParams;
  actor: Actor | null;
  body: Record<string, unknown>;
  pool: SqlPool;
  env: Wave1Env;
}): Promise<{ status: number; body: unknown }> {
  const { method, parts, search, actor, body, pool, env } = input;
  if (parts[1] === 'public' && parts[2] === 'forms' && parts[3]) {
    if (method === 'GET' && !parts[4]) return getPublicForm(pool, parts[3]);
    if (method === 'POST' && parts[4] === 'submit') return submitPublicForm(pool, parts[3], body);
  }
  if (parts[1] === 'public' && parts[2] === 'invites' && parts[4] === 'accept' && method === 'POST') {
    return acceptLeadInvite(pool, parts[3]);
  }
  if (parts[1] === 'members' && method === 'GET' && parts.length === 2 && search.has('tag')) {
    return listPeopleByTag(pool, actor, 'members', search.get('tag') || '', search.get('locationId') || '');
  }
  if (parts[1] === 'members' && method === 'POST' && parts[2] === 'bulk-status') {
    return bulkMemberStatus(pool, actor, body);
  }
  if (parts[1] === 'members' && parts[3] === 'notes') {
    if (method === 'GET') return listNotes(pool, actor, parts[2]);
    if (method === 'POST') return createNote(pool, actor, parts[2], body);
    if (method === 'PATCH') return patchNote(pool, actor, parts[2], String(body.id || parts[4] || ''), body);
  }
  if (parts[1] === 'members' && parts[3] === 'photo') {
    return memberPhoto(pool, actor, parts[2], method, search, env);
  }
  if (parts[1] === 'notes' && method === 'POST' && parts[3] === 'pin') {
    return pinNote(pool, actor, parts[2], body);
  }
  if (parts[1] === 'families' && parts[3] === 'contacts') {
    if (method === 'GET') return listContacts(pool, actor, parts[2]);
    if (method === 'PUT') return replaceContacts(pool, actor, parts[2], body);
  }
  if (parts[1] === 'statuses') {
    if (method === 'GET' && !parts[2]) return listStatuses(pool, actor, search);
    if (method === 'POST' && !parts[2]) return createStatus(pool, actor, body);
    if (method === 'PATCH' && parts[2]) return patchStatus(pool, actor, parts[2], body);
  }
  if (parts[1] === 'tags') {
    if (method === 'GET' && !parts[2]) return listTags(pool, actor, search);
    if (method === 'POST' && !parts[2]) return createTag(pool, actor, body);
    if (method === 'POST' && parts[2] === 'bulk-apply') return bulkApplyTags(pool, actor, body);
    if (method === 'PATCH' && parts[2]) return patchTag(pool, actor, parts[2], body);
  }
  if (parts[1] === 'forms') {
    if (method === 'GET' && !parts[2]) return listForms(pool, actor, search);
    if (method === 'POST' && !parts[2]) return createForm(pool, actor, body);
    if (method === 'PATCH' && parts[2] && !parts[3]) return patchForm(pool, actor, parts[2], body);
    if (method === 'PUT' && parts[3] === 'plans' && parts[4] === 'order') return orderFormPlans(pool, actor, parts[2], body);
  }
  if (parts[1] === 'leads' && method === 'POST' && parts.length === 2) return createManualLead(pool, actor, body);
  if (parts[1] === 'leads' && method === 'GET' && parts.length === 2) {
    return listPeopleByTag(pool, actor, 'leads', search.get('tag') || '', search.get('locationId') || '');
  }
  if (parts[1] === 'leads' && method === 'POST' && parts[3] === 'invites') {
    return createLeadInvite(pool, actor, parts[2], body);
  }
  return { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } };
}
