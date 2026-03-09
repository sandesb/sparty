const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

function restUrl(table) {
  return `${SUPABASE_URL}/rest/v1/${table}`;
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function supabaseSelect(table, filters = "") {
  const url = `${restUrl(table)}?select=*${filters ? "&" + filters : ""}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Supabase SELECT ${table} failed: ${res.status}`);
  return res.json();
}

export async function supabaseInsert(table, row) {
  const res = await fetch(restUrl(table), {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed: ${res.status}`);
  return res.json();
}

export async function supabaseUpsert(table, row) {
  const body = Array.isArray(row) ? row : [row];
  const res = await fetch(restUrl(table), {
    method: "POST",
    headers: headers({
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} failed: ${res.status}`);
  return res.json();
}

export async function supabaseUpdate(table, filters, updates) {
  const res = await fetch(`${restUrl(table)}?${filters}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Supabase UPDATE ${table} failed: ${res.status}`);
  return res.json();
}

export async function supabaseDelete(table, filters) {
  const res = await fetch(`${restUrl(table)}?${filters}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Supabase DELETE ${table} failed: ${res.status}`);
}
