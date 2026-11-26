/**
 * QuickBooks Online payload builder. Mock only.
 * Three companies, one per merchant school. No OAuth and no HTTP.
 */
import { CrmError } from './errors.ts';

export const QBO_COMPANIES = [
  { id: 'moh', legalName: "Moh's Martial Arts LLC", schools: ['waunakee', 'deforest', 'goninjaW'] },
  { id: 'lvlup2', legalName: 'LVLUP Martial Arts 2 LLC', schools: ['eastmad'] },
  { id: 'lvlup3', legalName: 'LVLUP Martial Arts 3 LLC', schools: ['verona', 'goninjaV'] },
] as const;

export function companyForSchool(locationId: string) {
  const hit = QBO_COMPANIES.find(c => (c.schools as readonly string[]).includes(locationId));
  if (!hit) throw new CrmError(400, 'no_company', 'No QuickBooks company for that school.');
  return hit;
}

export type QboLine = {
  amountCents: number;
  postingType: 'Debit' | 'Credit';
  accountCode: string;
  description: string;
  className?: string;
};

export function journalEntry(input: {
  companyId: string;
  txnDate: string;
  privateNote: string;
  lines: QboLine[];
}) {
  const debit = input.lines.filter(l => l.postingType === 'Debit').reduce((s, l) => s + l.amountCents, 0);
  const credit = input.lines.filter(l => l.postingType === 'Credit').reduce((s, l) => s + l.amountCents, 0);
  if (debit !== credit || debit <= 0) {
    throw new CrmError(422, 'unbalanced', 'Journal entry must balance.');
  }
  return {
    submitted: false as const,
    companyId: input.companyId,
    kind: 'journal' as const,
    payload: {
      TxnDate: input.txnDate,
      PrivateNote: input.privateNote,
      Line: input.lines.map((line, i) => ({
        Id: String(i + 1),
        Description: line.description,
        Amount: (line.amountCents / 100).toFixed(2),
        DetailType: 'JournalEntryLineDetail',
        JournalEntryLineDetail: {
          PostingType: line.postingType,
          AccountRef: { value: line.accountCode },
          ClassRef: line.className ? { name: line.className } : undefined,
        },
      })),
    },
  };
}

export function instructorBill(input: {
  companyId: string;
  txnDate: string;
  vendorName: string;
  amountCents: number;
  expenseAccount: string;
  payableAccount: string;
  className: string;
  description: string;
}) {
  if (input.amountCents <= 0) throw new CrmError(422, 'zero_bill', 'A bill needs a positive amount.');
  const journal = journalEntry({
    companyId: input.companyId,
    txnDate: input.txnDate,
    privateNote: input.description,
    lines: [
      {
        amountCents: input.amountCents,
        postingType: 'Debit',
        accountCode: input.expenseAccount,
        description: input.description,
        className: input.className,
      },
      {
        amountCents: input.amountCents,
        postingType: 'Credit',
        accountCode: input.payableAccount,
        description: input.vendorName,
        className: input.className,
      },
    ],
  });
  return {
    submitted: false as const,
    companyId: input.companyId,
    kind: 'bill' as const,
    payload: {
      TxnDate: input.txnDate,
      VendorRef: { name: input.vendorName },
      PrivateNote: input.description,
      Line: [{
        Amount: (input.amountCents / 100).toFixed(2),
        DetailType: 'AccountBasedExpenseLineDetail',
        Description: input.description,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: input.expenseAccount },
          ClassRef: { name: input.className },
        },
      }],
      journal,
    },
  };
}

export type QboEnv = { QBO_ENABLED?: string };

/** Flag off or on: this build does not call Intuit. */
export function assertQboOffline(env: QboEnv) {
  if (env.QBO_ENABLED === '1') {
    throw new CrmError(403, 'qbo_network_disabled', 'QuickBooks stays offline in this build.');
  }
  return { submitted: false as const };
}
