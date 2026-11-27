/* Generated from crm/src/qbo-export.ts. Do not edit by hand. */
"use strict";
var LvlupQbo = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/qbo-export.ts
  var qbo_export_exports = {};
  __export(qbo_export_exports, {
    QBO_AS_OF: () => QBO_AS_OF,
    QBO_CATEGORY_IDS: () => QBO_CATEGORY_IDS,
    QBO_CSV_HEADER: () => QBO_CSV_HEADER,
    QBO_JOURNAL_HEADER: () => QBO_JOURNAL_HEADER,
    QBO_SANDBOX_LINES: () => QBO_SANDBOX_LINES,
    SELECT_QBO_MAPPINGS: () => SELECT_QBO_MAPPINGS,
    UPSERT_QBO_MAPPING: () => UPSERT_QBO_MAPPING,
    applyMappingEdits: () => applyMappingEdits,
    assertIsoDate: () => assertIsoDate,
    buildQuickbooksExport: () => buildQuickbooksExport,
    catalogFromRows: () => catalogFromRows,
    catalogRows: () => catalogRows,
    cloneCatalog: () => cloneCatalog,
    companiesFor: () => companiesFor,
    csvEscape: () => csvEscape,
    defaultCatalog: () => defaultCatalog,
    dollarsToCents: () => dollarsToCents,
    formatDollars: () => formatDollars,
    journalFiles: () => journalFiles,
    monthBounds: () => monthBounds,
    parseCsv: () => parseCsv,
    periodRange: () => periodRange,
    processingFeeCents: () => processingFeeCents,
    seedRows: () => seedRows,
    shiftMonth: () => shiftMonth,
    toCsv: () => toCsv
  });

  // src/errors.ts
  var CrmError = class extends Error {
    constructor(status, code, message) {
      super(message);
      __publicField(this, "status");
      __publicField(this, "code");
      this.status = status;
      this.code = code;
    }
  };

  // src/qbo.ts
  var QBO_COMPANIES = [
    { id: "moh", legalName: "Moh's Martial Arts LLC", schools: ["waunakee", "deforest", "goninjaW"] },
    { id: "lvlup2", legalName: "LVLUP Martial Arts 2 LLC", schools: ["eastmad"] },
    { id: "lvlup3", legalName: "LVLUP Martial Arts 3 LLC", schools: ["verona", "goninjaV"] }
  ];

  // src/qbo-export.ts
  var QBO_AS_OF = "2026-11-27";
  var QBO_CSV_HEADER = [
    "Date",
    "Entity / LLC",
    "School / Class",
    "Financial Category",
    "QuickBooks Account",
    "Payment Count",
    "Gross",
    "Refunds",
    "Fees",
    "Net Deposit",
    "Memo"
  ];
  var QBO_JOURNAL_HEADER = [
    "Journal No",
    "Journal Date",
    "Account Name",
    "Debits",
    "Credits",
    "Description",
    "Class",
    "Location"
  ];
  var SEED = [
    ["tuition", "category", "lvlup", "Tuition", "4010 LVLUP Tuition", "", 10],
    ["events", "category", "lvlup", "Events", "4020 LVLUP Events", "", 20],
    ["tournaments", "category", "lvlup", "Tournaments", "4030 LVLUP Tournaments", "", 30],
    ["retail", "category", "lvlup", "Retail / Pro Shop", "4040 LVLUP Retail", "", 40],
    ["private_lessons", "category", "lvlup", "Private Lessons", "4050 LVLUP Private Lessons", "", 50],
    ["lvlup_parties", "category", "lvlup", "LVLUP Birthday Parties", "4060 LVLUP Birthday Parties", "", 60],
    ["gn_classes", "category", "goninja", "Go Ninja Classes", "4110 Go Ninja Classes", "", 70],
    ["gn_after_school", "category", "goninja", "Go Ninja After School", "4120 Go Ninja After School", "", 80],
    ["gn_summer_camp", "category", "goninja", "Go Ninja Summer Camp", "4130 Go Ninja Summer Camp", "", 90],
    ["gn_events", "category", "goninja", "Go Ninja Events", "4140 Go Ninja Events", "", 100],
    ["gn_parties", "category", "goninja", "Go Ninja Birthday Parties", "4150 Go Ninja Birthday Parties", "", 110],
    ["gn_retail", "category", "goninja", "Go Ninja Retail", "4160 Go Ninja Retail", "", 120],
    ["acct_refunds", "account", "adjust", "Refunds", "4900 Refunds", "", 200],
    ["acct_fees", "account", "adjust", "Processing Fees", "6100 Processing Fees", "", 210],
    ["acct_credits", "account", "adjust", "Family Credits", "2300 Family Credits", "", 220],
    ["acct_deposit", "account", "adjust", "Undeposited Funds", "1200 Undeposited Funds", "", 230],
    ["waunakee", "school", "school", "Waunakee", "", "Waunakee", 300],
    ["eastmad", "school", "school", "East Madison", "", "East Madison", 310],
    ["verona", "school", "school", "Verona", "", "Verona", 320],
    ["deforest", "school", "school", "DeForest", "", "DeForest", 330],
    ["goninjaW", "school", "school", "Go Ninja Waunakee", "", "Go Ninja Waunakee", 340],
    ["goninjaV", "school", "school", "Go Ninja Verona", "", "Go Ninja Verona", 350]
  ];
  function rowFromSeed(seed) {
    return {
      id: seed[0],
      kind: seed[1],
      brand: seed[2],
      name: seed[3],
      accountName: seed[4],
      className: seed[5],
      sortOrder: seed[6]
    };
  }
  function defaultCatalog() {
    const rows = SEED.map(rowFromSeed);
    return {
      categories: rows.filter((row) => row.kind === "category"),
      accounts: rows.filter((row) => row.kind === "account"),
      schools: rows.filter((row) => row.kind === "school")
    };
  }
  var QBO_CATEGORY_IDS = defaultCatalog().categories.map((row) => row.id);
  function processingFeeCents(capturedCents, method = "card") {
    if (method !== "card" || capturedCents <= 0) return 0;
    return Math.round(capturedCents * 0.029) + 30;
  }
  function ledger(id, on, locationId, categoryId, grossCents, memo, extra = {}) {
    var _a, _b, _c, _d;
    return {
      id,
      on,
      locationId,
      categoryId,
      count: (_a = extra.count) != null ? _a : 1,
      grossCents,
      refundCents: (_b = extra.refundCents) != null ? _b : 0,
      creditCents: (_c = extra.creditCents) != null ? _c : 0,
      method: (_d = extra.method) != null ? _d : "card",
      memo
    };
  }
  var QBO_SANDBOX_LINES = [
    ledger("nov-avery-tuition", "2026-11-03", "waunakee", "tuition", 22400, "Avery Sample tuition"),
    ledger("nov-hayden-tuition", "2026-11-06", "waunakee", "tuition", 15680, "Hayden Sample, family credit", { creditCents: 2500 }),
    ledger("nov-wk-tourney", "2026-11-08", "waunakee", "tournaments", 9e3, "Waunakee fall tournament"),
    ledger("nov-wk-private", "2026-11-10", "waunakee", "private_lessons", 8e3, "Avery Sample private lesson"),
    ledger("nov-wk-retail", "2026-11-12", "waunakee", "retail", 4500, "Avery Sample pro shop", { method: "cash" }),
    ledger("nov-wk-event", "2026-11-14", "waunakee", "events", 6500, "Parents Night Out"),
    ledger("nov-wk-retail-refund", "2026-11-18", "waunakee", "retail", 0, "Avery Sample pro shop refund", { refundCents: 2e3, method: "cash" }),
    ledger("nov-wk-late-refund", "2026-11-27", "waunakee", "retail", 0, "Late pro shop refund", { refundCents: 500, method: "cash" }),
    ledger("nov-wk-party", "2026-11-22", "waunakee", "lvlup_parties", 21900, "Riley Sample birthday party"),
    ledger("nov-df-tuition", "2026-11-11", "deforest", "tuition", 19900, "Logan Sample tuition"),
    ledger("nov-df-event", "2026-11-16", "deforest", "events", 4500, "DeForest seminar"),
    ledger("nov-gnw-class", "2026-11-04", "goninjaW", "gn_classes", 8900, "Cameron Sample classes"),
    ledger("nov-gnw-after", "2026-11-07", "goninjaW", "gn_after_school", 15e3, "Go Ninja after school"),
    ledger("nov-gnw-camp", "2026-11-09", "goninjaW", "gn_summer_camp", 12e3, "Summer camp deposit"),
    ledger("nov-gnw-event", "2026-11-18", "goninjaW", "gn_events", 6e3, "Ninja night"),
    ledger("nov-gnw-party", "2026-11-21", "goninjaW", "gn_parties", 25e3, "Cameron Sample, birthday party"),
    ledger("nov-gnw-retail", "2026-11-12", "goninjaW", "gn_retail", 1200, "Go Ninja grip socks", { method: "cash" }),
    ledger("nov-em-tuition", "2026-11-04", "eastmad", "tuition", 29900, "Jordan Sample tuition"),
    ledger("nov-em-event", "2026-11-15", "eastmad", "events", 12e3, "East Madison camp weekend", { refundCents: 1500 }),
    ledger("nov-em-tourney", "2026-11-17", "eastmad", "tournaments", 7e3, "East Madison tournament"),
    ledger("nov-em-retail", "2026-11-19", "eastmad", "retail", 3500, "Jordan Sample hoodie", { method: "cash" }),
    ledger("nov-em-private", "2026-11-20", "eastmad", "private_lessons", 6e3, "Jordan Sample private lesson", { creditCents: 1e3 }),
    ledger("nov-em-party", "2026-11-25", "eastmad", "lvlup_parties", 21900, "East Madison birthday party"),
    ledger("nov-ver-tuition", "2026-11-07", "verona", "tuition", 20900, "Blake Sample tuition"),
    ledger("nov-ver-tuition-2", "2026-11-09", "verona", "tuition", 22400, "Skyler Sample tuition"),
    ledger("nov-ver-event", "2026-11-20", "verona", "events", 8e3, 'Blake Sample "clinic"'),
    ledger("nov-ver-tourney", "2026-11-11", "verona", "tournaments", 5500, "Verona tournament"),
    ledger("nov-ver-retail", "2026-11-13", "verona", "retail", 3200, "Verona pro shop", { method: "cash" }),
    ledger("nov-ver-private", "2026-11-18", "verona", "private_lessons", 7500, "Skyler Sample private lesson"),
    ledger("nov-ver-party", "2026-11-28", "verona", "lvlup_parties", 18900, "Verona birthday party"),
    ledger("nov-gnv-class", "2026-11-08", "goninjaV", "gn_classes", 8900, "Taylor Sample classes"),
    ledger("nov-gnv-after", "2026-11-10", "goninjaV", "gn_after_school", 11e3, "Go Ninja Verona after school"),
    ledger("nov-gnv-camp", "2026-11-14", "goninjaV", "gn_summer_camp", 8e3, "Verona summer camp deposit"),
    ledger("nov-gnv-event", "2026-11-16", "goninjaV", "gn_events", 4e3, "Go Ninja Verona event"),
    ledger("nov-gnv-party", "2026-11-22", "goninjaV", "gn_parties", 18900, "Go Ninja Verona birthday party"),
    ledger("nov-gnv-retail", "2026-11-19", "goninjaV", "gn_retail", 1500, "Go Ninja Verona retail", { method: "cash", refundCents: 500 }),
    ledger("oct-wk-tuition", "2026-10-06", "waunakee", "tuition", 22400, "Avery Sample October tuition"),
    ledger("oct-ver-tourney", "2026-10-17", "verona", "tournaments", 6e3, "Skyler Sample October tournament"),
    ledger("oct-em-retail", "2026-10-20", "eastmad", "retail", 2e3, "October pro shop", { method: "cash" }),
    ledger("oct-gnw-class", "2026-10-12", "goninjaW", "gn_classes", 8900, "October Go Ninja classes"),
    ledger("sep-wk-tuition", "2026-09-15", "waunakee", "tuition", 1e3, "Outside the sample window"),
    ledger("dec-em-tuition", "2026-12-02", "eastmad", "tuition", 1e3, "Outside the sample window")
  ];
  var ALL_ROWS = () => SEED.map(rowFromSeed);
  function applyMappingEdits(catalog, edits) {
    const next = cloneCatalog(catalog);
    const byId = /* @__PURE__ */ new Map();
    for (const row of [...next.categories, ...next.accounts, ...next.schools]) byId.set(row.id, row);
    for (const edit of edits) {
      const row = byId.get(edit.id);
      if (!row) throw new CrmError(400, "unknown_category", "That QuickBooks category is not on the list.");
      if (edit.accountName != null && row.kind !== "school") row.accountName = cleanAccount(edit.accountName, row.name);
      if (edit.className != null) row.className = cleanClass(edit.className, row.kind === "school");
    }
    return next;
  }
  function cloneCatalog(catalog) {
    const copy = (row) => ({ ...row });
    return {
      categories: catalog.categories.map(copy),
      accounts: catalog.accounts.map(copy),
      schools: catalog.schools.map(copy)
    };
  }
  function cleanAccount(value, label) {
    const text = cleanLabel(value, 80);
    if (!text) throw new CrmError(400, "bad_account", label + " needs a QuickBooks account name.");
    return text;
  }
  function cleanClass(value, required) {
    const text = cleanLabel(value, 80);
    if (required && !text) throw new CrmError(400, "bad_class", "Each school needs a QuickBooks class.");
    return text;
  }
  function cleanLabel(value, max) {
    const text = String(value != null ? value : "").replace(/\s+/g, " ").trim();
    if (text.length > max) throw new CrmError(400, "bad_account", "Keep QuickBooks names to " + max + " characters.");
    if (/tel:|sms:/i.test(text) || /[\r\n]/.test(text)) {
      throw new CrmError(400, "bad_account", "That QuickBooks name cannot be saved.");
    }
    return text;
  }
  function csvEscape(value) {
    if (/[",\r\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
    return value;
  }
  function toCsv(rows) {
    return rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\r\n") + "\r\n";
  }
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const source = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (char === '"') {
          if (source[i + 1] === '"') {
            cell += '"';
            i += 1;
            continue;
          }
          quoted = false;
          continue;
        }
        cell += char;
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === ",") {
        row.push(cell);
        cell = "";
        continue;
      }
      if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }
      if (char === "\r") continue;
      cell += char;
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((item) => !(item.length === 1 && item[0] === ""));
  }
  function formatDollars(cents) {
    const neg = cents < 0;
    const abs = Math.abs(Math.round(cents));
    return (neg ? "-" : "") + Math.floor(abs / 100) + "." + String(abs % 100).padStart(2, "0");
  }
  function dollarsToCents(text) {
    if (!text) return 0;
    const neg = text.startsWith("-");
    const [dollars, coins = "0"] = text.replace("-", "").split(".");
    const cents = Number(dollars) * 100 + Number(coins.padEnd(2, "0").slice(0, 2));
    return neg ? -cents : cents;
  }
  function assertIsoDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new CrmError(400, "bad_date", "Use a YYYY-MM-DD date.");
    const [year, month, day] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
      throw new CrmError(400, "bad_date", "Use a real calendar date.");
    }
  }
  function monthBounds(iso) {
    assertIsoDate(iso);
    const [year, month] = iso.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mm = String(month).padStart(2, "0");
    return { from: year + "-" + mm + "-01", through: year + "-" + mm + "-" + String(last).padStart(2, "0") };
  }
  function shiftMonth(iso, delta) {
    assertIsoDate(iso);
    const [year, month] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(year, month - 1 + delta, 1));
    return dt.toISOString().slice(0, 10);
  }
  function periodRange(input) {
    const asOf = input.asOf || QBO_AS_OF;
    assertIsoDate(asOf);
    const period = input.period || "month";
    if (period === "last") {
      const bounds2 = monthBounds(shiftMonth(asOf, -1));
      return { id: "last", label: "Last Month", ...bounds2 };
    }
    if (period === "custom") {
      if (!input.from || !input.through) throw new CrmError(400, "bad_range", "Choose a start and end date.");
      assertIsoDate(input.from);
      assertIsoDate(input.through);
      if (input.from > input.through) throw new CrmError(400, "bad_range", "The start date has to be on or before the end date.");
      return { id: "custom", label: "Custom Range", from: input.from, through: input.through };
    }
    if (period !== "month") throw new CrmError(400, "bad_period", "Period must be this month, last month, or a custom range.");
    const bounds = monthBounds(asOf);
    return { id: "month", label: "This Month", ...bounds };
  }
  function companiesFor(entity) {
    if (entity === "all") return [...QBO_COMPANIES];
    const hit = QBO_COMPANIES.find((company) => company.id === entity);
    if (!hit) throw new CrmError(400, "bad_entity", "Pick one LLC or all three.");
    return [hit];
  }
  function accountOf(catalog, id) {
    const row = catalog.accounts.find((item) => item.id === id);
    if (!row) throw new CrmError(500, "missing_account", "QuickBooks account list is incomplete.");
    return row;
  }
  function schoolOf(catalog, id) {
    const row = catalog.schools.find((item) => item.id === id);
    if (!row) throw new CrmError(400, "bad_school", "That school is not on an LLC.");
    return row;
  }
  function emptyCategory(row) {
    return {
      id: row.id,
      name: row.name,
      brand: row.brand === "goninja" ? "goninja" : "lvlup",
      accountName: row.accountName,
      className: row.className,
      count: 0,
      grossCents: 0,
      refundCents: 0,
      feeCents: 0,
      creditCents: 0,
      netCents: 0
    };
  }
  function slug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function stamp(from, through) {
    if (from.slice(0, 7) === through.slice(0, 7) && from.endsWith("-01")) return from.slice(0, 7);
    return from + "_" + through;
  }
  function feeGroup(categoryId) {
    if (categoryId === "tuition" || categoryId === "gn_classes" || categoryId === "gn_after_school" || categoryId === "private_lessons") return "tuition";
    if (categoryId === "retail" || categoryId === "gn_retail") return "proshop";
    if (categoryId === "events" || categoryId === "gn_events" || categoryId === "tournaments" || categoryId === "gn_summer_camp") return "events";
    if (categoryId === "lvlup_parties" || categoryId === "gn_parties") return "parties";
    if (categoryId === "belt_test") return "belt_test";
    return "other";
  }
  function policyFeeCents(line, schedule) {
    const captured = Math.max(0, line.grossCents - (line.creditCents || 0));
    if (captured <= 0) return 0;
    const group = feeGroup(line.categoryId);
    if (group === "proshop" || group === "belt_test" || group === "other") return 0;
    const method = line.method === "ach" ? "ach" : line.method === "card" ? "card" : "other";
    if (method === "other") return 0;
    const on = group === "tuition" ? schedule.tuition : group === "events" ? schedule.events : schedule.parties;
    if (!on) return 0;
    if (method === "ach") {
      if (schedule.achMode === "flat") return Math.max(0, schedule.achFlatCents || 0);
      return Math.round(captured * schedule.achBps / 10000);
    }
    return Math.round(captured * schedule.cardBps / 10000) + Math.max(0, schedule.cardFixedCents || 0);
  }
  function lineFee(line, schedule) {
    if (schedule) return policyFeeCents(line, schedule);
    const captured = line.grossCents - line.creditCents;
    return processingFeeCents(captured, line.method);
  }
  function totalsOf(categories, creditCents) {
    const grossCents = categories.reduce((sum, row) => sum + row.grossCents, 0);
    const refundCents = categories.reduce((sum, row) => sum + row.refundCents, 0);
    const feeCents = categories.reduce((sum, row) => sum + row.feeCents, 0);
    const count = categories.reduce((sum, row) => sum + row.count, 0);
    const netCents = grossCents - refundCents - feeCents;
    const depositCents = netCents - creditCents;
    const formulaOk = categories.every((row) => row.netCents === row.grossCents - row.refundCents - row.feeCents) && netCents === grossCents - refundCents - feeCents && depositCents === netCents - creditCents;
    return { count, grossCents, refundCents, feeCents, creditCents, netCents, depositCents, formulaOk };
  }
  function buildEntity(company, period, catalog, lines, schedule) {
    const schools = new Set(company.schools);
    const buckets = /* @__PURE__ */ new Map();
    for (const line of lines) {
      if (!schools.has(line.locationId)) continue;
      if (line.on < period.from || line.on > period.through) continue;
      const key = line.on + "|" + line.locationId + "|" + line.categoryId;
      const bucket = buckets.get(key) || {
        date: line.on,
        locationId: line.locationId,
        categoryId: line.categoryId,
        count: 0,
        grossCents: 0,
        refundCents: 0,
        feeCents: 0,
        creditCents: 0,
        memos: []
      };
      bucket.count += line.count;
      bucket.grossCents += line.grossCents;
      bucket.refundCents += line.refundCents;
      bucket.feeCents += lineFee(line, schedule);
      bucket.creditCents += line.creditCents;
      if (line.memo) bucket.memos.push(line.memo);
      buckets.set(key, bucket);
    }
    const categories = catalog.categories.map(emptyCategory);
    const byCategory = new Map(categories.map((row) => [row.id, row]));
    for (const bucket of buckets.values()) {
      const category = byCategory.get(bucket.categoryId);
      if (!category) throw new CrmError(500, "bad_category", "A sample line uses an unknown category.");
      category.count += bucket.count;
      category.grossCents += bucket.grossCents;
      category.refundCents += bucket.refundCents;
      category.feeCents += bucket.feeCents;
      category.creditCents += bucket.creditCents;
    }
    for (const category of categories) {
      category.netCents = category.grossCents - category.refundCents - category.feeCents;
    }
    const creditCents = categories.reduce((sum, row) => sum + row.creditCents, 0);
    const totals = totalsOf(categories, creditCents);
    const refunds = accountOf(catalog, "acct_refunds");
    const fees = accountOf(catalog, "acct_fees");
    const credits = accountOf(catalog, "acct_credits");
    const deposit = accountOf(catalog, "acct_deposit");
    const categoryById = new Map(catalog.categories.map((row) => [row.id, row]));
    const detail = [[...QBO_CSV_HEADER]];
    const ordered = [...buckets.values()].sort((a, b) => {
      var _a, _b;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const school = schoolOf(catalog, a.locationId).sortOrder - schoolOf(catalog, b.locationId).sortOrder;
      if (school !== 0) return school;
      return (((_a = categoryById.get(a.categoryId)) == null ? void 0 : _a.sortOrder) || 0) - (((_b = categoryById.get(b.categoryId)) == null ? void 0 : _b.sortOrder) || 0);
    });
    const journalLines = [];
    const dates = [...new Set(ordered.map((bucket) => bucket.date))];
    for (const date of dates) {
      const day = ordered.filter((bucket) => bucket.date === date);
      const dayGross = day.reduce((sum, bucket) => sum + bucket.grossCents, 0);
      const dayRefund = day.reduce((sum, bucket) => sum + bucket.refundCents, 0);
      const dayFee = day.reduce((sum, bucket) => sum + bucket.feeCents, 0);
      const dayCredit = day.reduce((sum, bucket) => sum + bucket.creditCents, 0);
      const dayDeposit = dayGross - dayRefund - dayFee - dayCredit;
      const journalNo = "JE-" + company.id + "-" + date.replace(/-/g, "");
      for (const bucket of day) {
        const category = categoryById.get(bucket.categoryId);
        if (!category) continue;
        const school = schoolOf(catalog, bucket.locationId);
        const klass = category.className || school.className;
        const memo = memoText(bucket, school.name, category.name);
        if (bucket.grossCents || bucket.refundCents || bucket.feeCents || bucket.count) {
          detail.push([
            bucket.date,
            company.legalName,
            school.className,
            category.name,
            category.accountName,
            String(bucket.count),
            formatDollars(bucket.grossCents),
            formatDollars(bucket.refundCents),
            formatDollars(bucket.feeCents),
            formatDollars(bucket.grossCents - bucket.refundCents - bucket.feeCents),
            memo
          ]);
        }
        if (bucket.creditCents) {
          detail.push([
            bucket.date,
            company.legalName,
            school.className,
            credits.name,
            credits.accountName,
            "1",
            "0.00",
            formatDollars(bucket.creditCents),
            "0.00",
            formatDollars(-bucket.creditCents),
            "Family credit applied to " + category.name + ". Listed under Refunds so Net = Gross \u2212 Refunds \u2212 Fees. The journal posts " + credits.accountName + "."
          ]);
        }
        if (bucket.grossCents > 0) {
          journalLines.push({
            journalNo,
            date,
            accountName: category.accountName,
            debitCents: 0,
            creditCents: bucket.grossCents,
            description: category.name + " \xB7 " + school.name,
            className: klass,
            location: school.className
          });
        }
        if (bucket.refundCents > 0) {
          journalLines.push({
            journalNo,
            date,
            accountName: refunds.accountName,
            debitCents: bucket.refundCents,
            creditCents: 0,
            description: "Refund \xB7 " + category.name + " \xB7 " + school.name,
            className: klass,
            location: school.className
          });
        }
      }
      if (dayFee > 0) {
        journalLines.push({
          journalNo,
          date,
          accountName: fees.accountName,
          debitCents: dayFee,
          creditCents: 0,
          description: "Processing fees \xB7 " + company.legalName,
          className: "",
          location: ""
        });
      }
      if (dayCredit > 0) {
        journalLines.push({
          journalNo,
          date,
          accountName: credits.accountName,
          debitCents: dayCredit,
          creditCents: 0,
          description: "Family credits applied \xB7 " + company.legalName,
          className: "",
          location: ""
        });
      }
      if (dayDeposit > 0) {
        journalLines.push({
          journalNo,
          date,
          accountName: deposit.accountName,
          debitCents: dayDeposit,
          creditCents: 0,
          description: "Net deposit \xB7 " + company.legalName,
          className: "",
          location: ""
        });
      } else if (dayDeposit < 0) {
        journalLines.push({
          journalNo,
          date,
          accountName: deposit.accountName,
          debitCents: 0,
          creditCents: -dayDeposit,
          description: "Net deposit \xB7 " + company.legalName,
          className: "",
          location: ""
        });
      }
    }
    const debitCents = journalLines.reduce((sum, line) => sum + line.debitCents, 0);
    const creditSide = journalLines.reduce((sum, line) => sum + line.creditCents, 0);
    const batches = new Set(journalLines.map((line) => line.journalNo)).size;
    const balanced = debitCents === creditSide && (journalLines.length === 0 || debitCents > 0);
    const journalRows = [[...QBO_JOURNAL_HEADER]];
    for (const line of journalLines) {
      journalRows.push([
        line.journalNo,
        line.date,
        line.accountName,
        line.debitCents ? formatDollars(line.debitCents) : "",
        line.creditCents ? formatDollars(line.creditCents) : "",
        line.description,
        line.className,
        line.location
      ]);
    }
    const fileStamp = stamp(period.from, period.through);
    const base = slug(company.legalName) + "-" + fileStamp;
    const csvFile = { filename: "quickbooks-" + base + ".csv", body: toCsv(detail), kind: "csv", entityId: company.id };
    const journalFile = { filename: "qbo-journal-" + base + ".csv", body: toCsv(journalRows), kind: "journal", entityId: company.id };
    return {
      id: company.id,
      legalName: company.legalName,
      schools: [...company.schools],
      categories,
      totals,
      journal: { balanced, debitCents, creditCents: creditSide, batches },
      csv: csvFile.body,
      journalCsv: journalFile.body,
      files: { csv: csvFile, journal: journalFile }
    };
  }
  function memoText(bucket, school, category) {
    const extra = bucket.memos.filter((memo, index) => bucket.memos.indexOf(memo) === index).join("; ");
    const text = extra || school + " \xB7 " + category;
    return text.length > 180 ? text.slice(0, 177) + "..." : text;
  }
  function sumCategories(entities, catalog) {
    return catalog.categories.map((row) => {
      const total = emptyCategory(row);
      for (const entity of entities) {
        const hit = entity.categories.find((item) => item.id === row.id);
        if (!hit) continue;
        total.count += hit.count;
        total.grossCents += hit.grossCents;
        total.refundCents += hit.refundCents;
        total.feeCents += hit.feeCents;
        total.creditCents += hit.creditCents;
      }
      total.netCents = total.grossCents - total.refundCents - total.feeCents;
      return total;
    });
  }
  function buildQuickbooksExport(input = {}) {
    const catalog = input.catalog || defaultCatalog();
    const period = periodRange(input);
    const companies = companiesFor(input.entity || "all");
    const lines = input.lines || QBO_SANDBOX_LINES;
    const entities = companies.map((company) => buildEntity(company, period, catalog, lines, input.feeSchedule));
    const categories = sumCategories(entities, catalog);
    const creditCents = categories.reduce((sum, row) => sum + row.creditCents, 0);
    const totals = totalsOf(categories, creditCents);
    const debitCents = entities.reduce((sum, entity) => sum + entity.journal.debitCents, 0);
    const creditSide = entities.reduce((sum, entity) => sum + entity.journal.creditCents, 0);
    const balanced = entities.every((entity) => entity.journal.balanced) && debitCents === creditSide && totals.formulaOk;
    const summaryRows = [[
      "Entity / LLC",
      "Payment Count",
      "Gross",
      "Refunds",
      "Fees",
      "Family Credits",
      "Net",
      "Deposit",
      "Debits",
      "Credits",
      "Balanced"
    ]];
    for (const entity of entities) {
      summaryRows.push([
        entity.legalName,
        String(entity.totals.count),
        formatDollars(entity.totals.grossCents),
        formatDollars(entity.totals.refundCents),
        formatDollars(entity.totals.feeCents),
        formatDollars(entity.totals.creditCents),
        formatDollars(entity.totals.netCents),
        formatDollars(entity.totals.depositCents),
        formatDollars(entity.journal.debitCents),
        formatDollars(entity.journal.creditCents),
        entity.journal.balanced ? "yes" : "no"
      ]);
    }
    summaryRows.push([
      "TOTAL",
      String(totals.count),
      formatDollars(totals.grossCents),
      formatDollars(totals.refundCents),
      formatDollars(totals.feeCents),
      formatDollars(totals.creditCents),
      formatDollars(totals.netCents),
      formatDollars(totals.depositCents),
      formatDollars(debitCents),
      formatDollars(creditSide),
      balanced ? "yes" : "no"
    ]);
    const fileStamp = stamp(period.from, period.through);
    const summaryFile = {
      filename: "quickbooks-all-entities-summary-" + fileStamp + ".csv",
      body: toCsv(summaryRows),
      kind: "summary",
      entityId: "all"
    };
    const files = [];
    for (const entity of entities) files.push(entity.files.csv);
    if (entities.length > 1) files.push(summaryFile);
    return {
      fixture: true,
      live: false,
      charged: false,
      submitted: false,
      synced: false,
      qboSyncEnabled: false,
      entity: input.entity || "all",
      period,
      entities,
      summary: { ...totals, balanced, debitCents, journalCreditCents: creditSide, categories },
      summaryCsv: summaryFile.body,
      files,
      journalFiles: entities.map((entity) => entity.files.journal)
    };
  }
  function journalFiles(report) {
    return report.entities.map((entity) => entity.files.journal);
  }
  function catalogFromRows(rows) {
    const catalog = defaultCatalog();
    const known = /* @__PURE__ */ new Map();
    for (const row of [...catalog.categories, ...catalog.accounts, ...catalog.schools]) known.set(row.id, row);
    for (const stored of rows) {
      const row = known.get(String(stored.id || ""));
      if (!row) continue;
      if (row.kind !== "school" && stored.qbo_account_name != null && String(stored.qbo_account_name).trim()) {
        row.accountName = String(stored.qbo_account_name).trim();
      }
      if (stored.qbo_class_name != null && String(stored.qbo_class_name).trim()) {
        row.className = String(stored.qbo_class_name).trim();
      }
    }
    return catalog;
  }
  function catalogRows(catalog) {
    return [...catalog.categories, ...catalog.accounts, ...catalog.schools];
  }
  var SELECT_QBO_MAPPINGS = "select id, kind, brand, name, qbo_account_name, qbo_class_name, sort_order from qbo_category_mappings order by sort_order, id";
  var UPSERT_QBO_MAPPING = `insert into qbo_category_mappings (id, kind, brand, name, qbo_account_name, qbo_class_name, sort_order)
values ($1, $2, $3, $4, $5, $6, $7)
on conflict (id) do update set
  qbo_account_name = excluded.qbo_account_name,
  qbo_class_name = excluded.qbo_class_name,
  updated_at = now()`;
  function seedRows() {
    return ALL_ROWS().map((row) => [row.id, row.kind, row.brand, row.name, row.accountName, row.className, row.sortOrder]);
  }
  return __toCommonJS(qbo_export_exports);
})();
