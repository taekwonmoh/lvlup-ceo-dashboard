/**
 * Strip connection strings and other secrets from text that might be returned or logged.
 * This file never prints the values it is given.
 */

const SECRET_KEY = /(SECRET|PASSWORD|TOKEN|DATABASE_URL|CONNECTION|PRIVATE_KEY|_KEY)/i;
const POSTGRES_URL = /postgres(?:ql)?:\/\/[^\s"'\\]+/gi;

export function redactText(input: string, secrets: string[] = []): string {
  let out = input;
  const unique = [...new Set(secrets.filter(secret => typeof secret === 'string' && secret.length >= 8))];
  unique.sort((a, b) => b.length - a.length);
  for (const secret of unique) {
    out = out.split(secret).join('[redacted]');
    const escaped = JSON.stringify(secret).slice(1, -1);
    if (escaped !== secret) out = out.split(escaped).join('[redacted]');
  }
  out = out.replace(POSTGRES_URL, '[redacted]');
  out = out.replace(/\b(password|pwd|secret|connectionString)\b\s*[:=]\s*[^\s,}'"]+/gi, '$1=[redacted]');
  return out;
}

export function secretValues(env: object): string[] {
  const bag = env as Record<string, unknown>;
  const found: string[] = [];
  const hyper = bag.HYPERDRIVE;
  if (hyper && typeof hyper === 'object') {
    const connectionString = (hyper as { connectionString?: unknown }).connectionString;
    if (typeof connectionString === 'string') found.push(connectionString);
  }
  for (const [key, value] of Object.entries(bag)) {
    if (typeof value !== 'string' || value.length < 8) continue;
    if (SECRET_KEY.test(key)) found.push(value);
  }
  return found;
}

export function sanitizeJson(body: unknown, secrets: string[]): unknown {
  const raw = JSON.stringify(body);
  if (raw == null) return { error: { code: 'error', message: 'Request failed.' } };
  const cleaned = redactText(raw, secrets);
  if (cleaned === raw) return body;
  try {
    return JSON.parse(cleaned);
  } catch {
    return { error: { code: 'error', message: 'Request failed.' } };
  }
}

export function clientMessage(message: string, secrets: string[], redact: boolean): string {
  if (!redact) return message;
  const cleaned = redactText(message, secrets);
  return cleaned === message ? message : 'Request failed.';
}
