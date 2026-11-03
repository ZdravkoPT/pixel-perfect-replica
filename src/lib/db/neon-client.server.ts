/**
 * Server-only, supabase-js-compatible query builder that runs SQL on Neon through the
 * Lovable connector gateway. Supports the subset this app uses: select with one-level
 * embeds, filters, order/limit/range, single/maybeSingle, insert/update/upsert/delete,
 * count, and rpc. Results are JSON-serialized by Postgres (numbers stay numbers,
 * timestamps ISO) so callers see the same shapes PostgREST returned.
 */
import { META } from "./meta";

const GATEWAY = "https://connector-gateway.lovable.dev/neon/sql";
type R<T = any> = { data: T; error: { message: string; code?: string } | null; count?: number | null };

async function sql(query: string, params: unknown[]): Promise<any[]> {
  const L = process.env["LOVABLE_API_KEY"], N = process.env["NEON_API_KEY"];
  if (!L || !N) throw new Error("Missing LOVABLE_API_KEY or NEON_API_KEY");
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now(); (globalThis as any).__nq = ((globalThis as any).__nq ?? 0) + 1; if ((globalThis as any).__nq % 20 === 0) console.warn(`[neon queries ${(globalThis as any).__nq}] ${query.slice(0, 160)}`);
    const res = await fetch(GATEWAY, { method: "POST", headers: { Authorization: `Bearer ${L}`, "X-Connection-Api-Key": N, "Content-Type": "application/json" }, body: JSON.stringify({ query, params }) });
    const text = await res.text();
    if (process.env["NEON_SLOW_LOG"] !== "0" && Date.now() - t0 > 700) console.warn(`[neon slow ${Date.now() - t0}ms] ${query.slice(0, 220)}`);
    let json: any = {}; try { json = JSON.parse(text); } catch { /* keep */ }
    if (res.ok) return json.rows ?? [];
    if ((res.status === 429 || res.status === 500 || res.status === 503) && attempt < 3) { await new Promise((r) => setTimeout(r, 600 * attempt)); continue; }
    throw Object.assign(new Error(json.message ?? text.slice(0, 300)), { code: json.code ?? String(res.status) });
  }
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
/** Column reference, allowing json paths like provider_ids->>fotmob. */
function col(c: string, alias: string) {
  const m = c.match(/^([\w]+)((?:->>?[\w]+)*)$/);
  if (!m) throw new Error(`Unsupported column: ${c}`);
  const path = (m[2] ?? "").replace(/(->>?)(\w+)/g, (_s, op, k) => `${op}'${k}'`);
  return `${alias}.${q(m[1]!)}${path}`;
}
function splitTop(s: string) {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

let aliasN = 0;
/** Build select list for table `t` aliased `a`; returns [sqlList, innerJoinConditions]. */
function selectList(t: string, a: string, cols: string): [string, string[]] {
  const parts: string[] = [], inner: string[] = [];
  for (const raw of splitTop(cols || "*")) {
    const em = raw.match(/^(?:(\w+):)?(\w+)(?:!(\w+))?\((.*)\)$/s);
    if (em) {
      const [, alias, target, hint, sub] = em as unknown as [string, string | undefined, string, string | undefined, string];
      const name = alias ?? target, b = `e${++aliasN}`;
      const isInner = hint === "inner";
      const fkCol = hint && !isInner ? hint : undefined;
      const [list] = selectList(target, b, sub);
      const toOne = META.fk.find(([ft, fc, tt]) => ft === t && tt === target && (!fkCol || fc === fkCol));
      let expr: string, exists: string;
      if (toOne) {
        const cond = `${b}.${q(toOne[3])} = ${a}.${q(toOne[1])}`;
        expr = `(select to_json(x) from (select ${list} from public.${q(target)} ${b} where ${cond}) x)`;
        exists = `exists (select 1 from public.${q(target)} ${b} where ${cond})`;
      } else {
        const many = META.fk.find(([ft, fc, tt]) => ft === target && tt === t && (!fkCol || fc === fkCol));
        if (!many) throw new Error(`No relation between ${t} and ${target}`);
        const cond = `${b}.${q(many[1])} = ${a}.${q(many[3])}`;
        expr = `(select coalesce(json_agg(x), '[]'::json) from (select ${list} from public.${q(target)} ${b} where ${cond}) x)`;
        exists = `exists (select 1 from public.${q(target)} ${b} where ${cond})`;
      }
      parts.push(`${expr} as ${q(name)}`);
      if (isInner) inner.push(exists);
      continue;
    }
    if (raw === "*") { parts.push(`${a}.*`); continue; }
    const am = raw.match(/^(?:(\w+):)?([\w>-]+?)(?:::(\w+))?$/);
    if (!am) throw new Error(`Unsupported select: ${raw}`);
    const [, alias, c, cast] = am as unknown as [string, string | undefined, string, string | undefined];
    const key = alias ?? (c.includes("->") ? c.split(/->>?/).pop()! : c);
    parts.push(`${col(c, a)}${cast ? `::${cast}` : ""} as ${q(key)}`);
  }
  return [parts.join(", "), inner];
}

function parseVal(v: string): unknown { if (v === "null") return null; if (v === "true") return true; if (v === "false") return false; return v; }

class Builder<T = any> implements PromiseLike<R<T>> {
  private where: string[] = []; private params: unknown[] = [];
  private orders: string[] = []; private lim?: number; private off?: number;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private cols = "*"; private returning?: string; private payload: any; private opts: any = {};
  private one?: "single" | "maybe"; private countMode = false; private head = false;
  constructor(private table: string) {}
  private p(v: unknown) { this.params.push(Array.isArray(v) || v === null || typeof v !== "object" ? v : JSON.stringify(v)); return `$${this.params.length}`; }

  select(cols = "*", o?: { count?: string; head?: boolean }) {
    if (this.mode === "select") { this.cols = cols; this.countMode = !!o?.count; this.head = !!o?.head; } else this.returning = cols;
    return this;
  }
  insert(rows: any, o?: any) { this.mode = "insert"; this.payload = rows; this.opts = o ?? {}; return this; }
  upsert(rows: any, o?: any) { this.mode = "upsert"; this.payload = rows; this.opts = o ?? {}; return this; }
  update(row: any) { this.mode = "update"; this.payload = row; return this; }
  delete() { this.mode = "delete"; return this; }

  private op(c: string, op: string, v: unknown): string {
    const C = col(c, "b0");
    switch (op) {
      case "eq": return v === null ? `${C} is null` : `${C} = ${this.p(v)}`;
      case "neq": return `${C} is distinct from ${this.p(v)}`;
      case "gt": return `${C} > ${this.p(v)}`; case "gte": return `${C} >= ${this.p(v)}`;
      case "lt": return `${C} < ${this.p(v)}`; case "lte": return `${C} <= ${this.p(v)}`;
      case "like": return `${C}::text like ${this.p(v)}`; case "ilike": return `${C}::text ilike ${this.p(v)}`;
      case "is": return `${C} is ${v === null || v === "null" ? "null" : v === true || v === "true" ? "true" : "false"}`;
      case "in": { const arr = Array.isArray(v) ? v : String(v).replace(/^\(|\)$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, "")); return `${C} = any(${this.p(arr)})`; }
      case "cs": case "contains": return `${C} @> ${this.p(v)}`;
      case "ov": case "overlaps": return `${C} && ${this.p(v)}`;
      default: throw new Error(`Unsupported filter ${op}`);
    }
  }
  eq(c: string, v: unknown) { this.where.push(this.op(c, "eq", v)); return this; }
  neq(c: string, v: unknown) { this.where.push(this.op(c, "neq", v)); return this; }
  gt(c: string, v: unknown) { this.where.push(this.op(c, "gt", v)); return this; }
  gte(c: string, v: unknown) { this.where.push(this.op(c, "gte", v)); return this; }
  lt(c: string, v: unknown) { this.where.push(this.op(c, "lt", v)); return this; }
  lte(c: string, v: unknown) { this.where.push(this.op(c, "lte", v)); return this; }
  like(c: string, v: unknown) { this.where.push(this.op(c, "like", v)); return this; }
  ilike(c: string, v: unknown) { this.where.push(this.op(c, "ilike", v)); return this; }
  is(c: string, v: unknown) { this.where.push(this.op(c, "is", v)); return this; }
  in(c: string, v: unknown[]) { this.where.push(this.op(c, "in", v)); return this; }
  contains(c: string, v: unknown) { this.where.push(this.op(c, "cs", v)); return this; }
  overlaps(c: string, v: unknown) { this.where.push(this.op(c, "ov", v)); return this; }
  match(o: Record<string, unknown>) { for (const [k, v] of Object.entries(o)) this.eq(k, v); return this; }
  filter(c: string, op: string, v: unknown) { this.where.push(this.op(c, op, typeof v === "string" ? parseVal(v) : v)); return this; }
  not(c: string, op: string, v: unknown) { this.where.push(`not (${this.op(c, op, v)})`); return this; }
  or(expr: string) {
    const parts = splitTop(expr).map((p) => {
      const m = p.match(/^([\w>-]+)\.(not\.)?(\w+)\.(.*)$/s);
      if (!m) throw new Error(`Unsupported or(): ${p}`);
      const s = this.op(m[1]!, m[3]!, m[3] === "in" ? m[4] : parseVal(m[4]!));
      return m[2] ? `not (${s})` : s;
    });
    this.where.push(`(${parts.join(" or ")})`); return this;
  }
  order(c: string, o?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push(`${col(c, "b0")} ${o?.ascending === false ? "desc" : "asc"}${o?.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"}`); return this;
  }
  limit(n: number) { this.lim = n; return this; }
  range(from: number, to: number) { this.off = from; this.lim = to - from + 1; return this; }
  single() { this.one = "single"; return this as unknown as Builder<any>; }
  maybeSingle() { this.one = "maybe"; return this as unknown as Builder<any>; }

  private build(): string {
    const T = `public.${q(this.table)}`, W = this.where.length ? ` where ${this.where.join(" and ")}` : "";
    if (this.mode === "select") {
      const [list, inner] = selectList(this.table, "b0", this.cols);
      const w = [...this.where, ...inner];
      const where = w.length ? ` where ${w.join(" and ")}` : "";
      const tail = `${this.orders.length ? ` order by ${this.orders.join(", ")}` : ""}${this.lim !== undefined ? ` limit ${Math.floor(this.lim)}` : ""}${this.off ? ` offset ${Math.floor(this.off)}` : ""}`;
      const cnt = this.countMode ? `, (select count(*)::int from ${T} b0${where}) as c` : "";
      return `select ${this.head ? "'[]'::json" : `coalesce((select json_agg(r) from (select ${list} from ${T} b0${where}${tail}) r), '[]'::json)`} as d${cnt}`;
    }
    const ret = this.returning !== undefined ? selectList(this.table, "w", this.returning)[0] : null;
    const wrap = (stmt: string) => ret ? `with w as (${stmt} returning *) select coalesce((select json_agg(r) from (select ${ret} from w) r), '[]'::json) as d` : `with w as (${stmt} returning 1) select '[]'::json as d`;
    if (this.mode === "delete") return wrap(`delete from ${T} b0${W}`);
    if (this.mode === "update") {
      const sets = Object.entries(this.payload ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => `${q(k)} = (jsonb_populate_record(null::${T}, jsonb_build_object('${k.replace(/'/g, "''")}', ${this.p(v === null ? null : JSON.stringify(v))}::jsonb))).${q(k)}`);
      return wrap(`update ${T} b0 set ${sets.join(", ")}${W}`);
    }
    const rows: any[] = Array.isArray(this.payload) ? this.payload : [this.payload];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)))];
    const list = keys.map(q).join(", ");
    const src = `select ${list} from jsonb_populate_recordset(null::${T}, ${this.p(JSON.stringify(rows))}::jsonb)`;
    let stmt = `insert into ${T} as b0 (${list}) ${src}`;
    if (this.mode === "upsert") {
      const target = (this.opts.onConflict ? String(this.opts.onConflict).split(",").map((s) => s.trim()) : META.pk[this.table] ?? ["id"]);
      const upd = keys.filter((k) => !target.includes(k));
      stmt += ` on conflict (${target.map(q).join(", ")}) ` + (this.opts.ignoreDuplicates || !upd.length ? "do nothing" : `do update set ${upd.map((k) => `${q(k)} = excluded.${q(k)}`).join(", ")}`);
    } else if (this.opts.onConflict === "ignore") stmt += " on conflict do nothing";
    return wrap(stmt);
  }

  async run(): Promise<R<T>> {
    if (this.mode !== "select" && rowsEmpty(this.payload)) return { data: [] as any, error: null };
    try {
      const rows = await sql(this.build(), this.params);
      let data: any = rows[0]?.d ?? [];
      const count = this.countMode ? Number(rows[0]?.c ?? 0) : null;
      if (this.one) {
        if (data.length > 1 || (this.one === "single" && data.length === 0)) return { data: null as any, error: { message: `JSON object requested, ${data.length} rows returned`, code: "PGRST116" }, count };
        data = data[0] ?? null;
      } else if (this.mode !== "select" && this.returning === undefined) data = null;
      return { data, error: null, count };
    } catch (e: any) {
      return { data: null as any, error: { message: e?.message ?? String(e), code: e?.code }, count: null };
    }
  }
  then<A = R<T>, B = never>(ok?: ((v: R<T>) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) { return this.run().then(ok, bad); }
}
function rowsEmpty(p: unknown) { return Array.isArray(p) && p.length === 0; }

export const neonDb = {
  from: (table: string) => new Builder(table),
  async rpc(fn: string, args: Record<string, unknown> = {}) {
    const names = Object.keys(args);
    try {
      const rows = await sql(`select to_json(public.${q(fn)}(${names.map((n, i) => `${q(n)} => $${i + 1}`).join(", ")})) as d`, names.map((n) => args[n]));
      return { data: rows[0]?.d ?? null, error: null };
    } catch (e: any) { return { data: null, error: { message: e?.message ?? String(e), code: e?.code } }; }
  },
};
export type NeonDb = typeof neonDb;
