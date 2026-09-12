# Rowbook browser E2E

`smoke.py` remains the unauthenticated public smoke suite:

```sh
npm run test:e2e
```

`authenticated.py` is deliberately opt-in. It creates disposable Supabase Auth
users and uploads the Garmin and Strava fixtures through the real application,
while all application data is constrained to a local PostgreSQL database named
exactly `rowbook_season_test`. The harness removes its Storage objects, Auth
users, cookies, browser storage, and exact-ID database rows in a `finally` block.

Prepare the browser once:

```sh
python3 -m pip install -r tests/e2e/requirements.txt
python3 -m playwright install chromium
```

For a fully local run, start an isolated Supabase CLI stack. Capturing `status`
as shell variables avoids printing its temporary keys:

```sh
export ROWBOOK_LOCAL_SUPABASE_DIR="$(mktemp -d /tmp/rowbook-supabase-e2e.XXXXXX)"
supabase init --workdir "$ROWBOOK_LOCAL_SUPABASE_DIR" --yes
supabase start --workdir "$ROWBOOK_LOCAL_SUPABASE_DIR" \
  --exclude edge-runtime,imgproxy,logflare,mailpit,postgres-meta,postgrest,realtime,studio,supavisor,vector \
  >/dev/null
eval "$(supabase status --workdir "$ROWBOOK_LOCAL_SUPABASE_DIR" -o env 2>/dev/null)"
export SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export SUPABASE_ANON_KEY="$ANON_KEY"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export SUPABASE_STORAGE_BUCKET='rowbook-e2e'
```

Then run the app with both database URLs overridden and request-triggered
background extraction disabled:

```sh
export DATABASE_URL="postgresql://${USER}@localhost:5432/rowbook_season_test"
export DIRECT_URL="$DATABASE_URL"
export ROWBOOK_DISABLE_BACKGROUND_JOBS=1
export E2E_BASE_URL='http://localhost:3100'
export ROWBOOK_E2E_AUTHENTICATED=1
PORT=3100 npm run dev
```

In another shell with the same exported variables and Supabase credentials:

```sh
npm run test:e2e:authenticated
```

When finished, remove the isolated local services and volumes:

```sh
supabase stop --workdir "$ROWBOOK_LOCAL_SUPABASE_DIR" --no-backup
trash "$ROWBOOK_LOCAL_SUPABASE_DIR"
```

Using the local stack also avoids hosted Auth hooks that may reject disposable
email addresses against a production allowlist.

The harness refuses any non-local application URL, any non-local database host,
or any database name other than `rowbook_season_test`. It never runs migrations;
apply the repository migrations to that local test database before starting.
