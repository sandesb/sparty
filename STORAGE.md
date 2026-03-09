## Sparkonto state storage (Supabase)

All user progress (weekly withdrawals and rewards) is persisted in **Supabase**, so the same state is available across devices and when switching between Admin and User views.

### Table

- **Table name**: `sparkonto_state`
- **Columns**:
  - `id` — `text` primary key (e.g. `sparkonto_state_v1`)
  - `data` — `jsonb` not null, holds the full state payload

One row is used for the app: `id = 'sparkonto_state_v1'`. Admin and user both read and write this row.

### Value shape (inside `data`)

```ts
{
  version: 1,                   // number – schema version
  weeks: Array<{
    week: number;              // 1–52
    month: number;             // 1–13 (4 weeks per month)
    withdrawn: number;         // amount withdrawn in this week
    locked: boolean;           // whether future editing is blocked
    completed: boolean;       // whether this week is finished
  }>,
  totalWithdrawn: number;       // sum of withdrawn amounts across all weeks
  currentWeek: number;          // 1–52, pointer to the active week
  monthRewards: {
    [month: string]: {
      reward: number;          // locked-in reward for that month
      claimed: boolean;        // whether the reward has been claimed
      spend: number;           // total spend in that month
    }
  },
  totalRewardsClaimed: number;  // sum of all claimed rewards
}
```

### Lifecycle

- **Hydration guard**  
  The app uses a `hydrated` flag so it never overwrites existing data with a fresh in‑memory state on first load:
  - On mount, it **only reads** from Supabase (SELECT by `id`), merges any stored `data` into React state, and then sets `hydrated = true`.
  - Until `hydrated` is `true`, **no writes** to Supabase are performed.

- **Load (Read)**: on app mount, the code runs a Supabase SELECT on `sparkonto_state` with `id = 'sparkonto_state_v1'`. If a row exists and `data.weeks` is an array, those values are merged into the in‑memory state. If there is no row or the data is invalid, the app keeps the default initial state.

- **Save (Create/Update)**: after hydration, whenever any of the following change:
  - `weeks`
  - `totalWithdrawn`
  - `currentWeek`
  - `monthRewards`
  - `totalRewardsClaimed`

  …the app sends the full payload above as the `data` column via a Supabase **UPSERT** on `sparkonto_state` with `id = 'sparkonto_state_v1'` (insert if missing, update if present). On failure (e.g. network), a “Sync failed” toast is shown and in‑memory state is left unchanged.

### SQL to create the table

Run in the Supabase SQL Editor if the table does not exist yet:

```sql
create table if not exists sparkonto_state (
  id   text primary key,
  data jsonb not null default '{}'
);
```

Optional, if your project has RLS enabled and you want the anon key to read/write this table:

```sql
alter table sparkonto_state enable row level security;
create policy "Allow anon read/write sparkonto_state"
  on sparkonto_state for all
  to anon using (true) with check (true);
```
