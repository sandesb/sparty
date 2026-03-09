## Sparkonto localStorage data

All user progress (weekly withdrawals and rewards) is persisted in `localStorage`
under a single key:

- **Key**: `sparkonto_state_v1`

### Value shape (JSON)

```ts
{
  version: 1,                   // number – schema version
  weeks: Array<{
    week: number;              // 1–52
    month: number;             // 1–13 (4 weeks per month)
    withdrawn: number;         // amount withdrawn in this week
    locked: boolean;           // whether future editing is blocked
    completed: boolean;        // whether this week is finished
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
  The app uses a `hydrated` flag so it never overwrites existing data with a
  fresh in‑memory state on first load:
  - On mount, it **only reads** from `localStorage`, merges any stored values
    into React state, and then sets `hydrated = true`.
  - Until `hydrated` is `true`, **no writes** to `localStorage` are performed.

- **Load**: on app mount, the code reads `sparkonto_state_v1`, validates that
  `weeks` is an array, and merges the stored values into the in‑memory state.
  If the JSON is corrupt or incompatible, it is silently ignored and a fresh
  in‑memory state is used instead.

- **Save**: after hydration, whenever any of the following change:
  - `weeks`
  - `totalWithdrawn`
  - `currentWeek`
  - `monthRewards`
  - `totalRewardsClaimed`

  …the app writes the full payload above back to `localStorage`.


