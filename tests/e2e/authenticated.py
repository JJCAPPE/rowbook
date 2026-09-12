"""Opt-in authenticated Rowbook E2E test with disposable local data.

The browser exercises the real Supabase-backed upload and authentication paths,
but application rows are allowed only in the exact local database named
``rowbook_season_test``. Temporary Auth users and Storage objects are removed in
``finally`` even when an assertion fails.
"""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from playwright.sync_api import (
    Browser,
    BrowserContext,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    expect,
    sync_playwright,
)


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = [
    ROOT / "tests" / "test-photos" / "garmin.PNG",
    ROOT / "tests" / "test-photos" / "strava.PNG",
]
ATHLETE_NAME = "E2E Athlete"
COACH_NAME = "E2E Coach"
TEAM_NAME = "E2E Local Team"
EXPECTED_DATABASE = "rowbook_season_test"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class HarnessError(RuntimeError):
    """An error whose message is safe to print without leaking test data."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise HarnessError(message)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


class LocalPostgres:
    def __init__(self, database_url: str) -> None:
        parsed = urllib.parse.urlparse(database_url)
        database = urllib.parse.unquote(parsed.path.lstrip("/"))
        require(parsed.scheme in {"postgres", "postgresql"}, "DATABASE_URL must be PostgreSQL.")
        require(parsed.hostname in LOCAL_HOSTS, "DATABASE_URL must use a local host.")
        require(database == EXPECTED_DATABASE, f"DATABASE_URL must target {EXPECTED_DATABASE}.")
        require(bool(parsed.username), "DATABASE_URL must include an explicit local database user.")

        self.env = os.environ.copy()
        self.env.update(
            {
                "PGHOST": parsed.hostname or "",
                "PGPORT": str(parsed.port or 5432),
                "PGUSER": urllib.parse.unquote(parsed.username or ""),
                "PGDATABASE": database,
                "PGCONNECT_TIMEOUT": "5",
            }
        )
        if parsed.password is not None:
            self.env["PGPASSWORD"] = urllib.parse.unquote(parsed.password)
        query = urllib.parse.parse_qs(parsed.query)
        if query.get("sslmode"):
            self.env["PGSSLMODE"] = query["sslmode"][0]

    def rows(self, sql: str) -> list[list[str]]:
        result = subprocess.run(
            [
                "psql",
                "-X",
                "-qAt",
                "-v",
                "ON_ERROR_STOP=1",
                "--field-separator=\x1f",
            ],
            input=sql,
            text=True,
            capture_output=True,
            env=self.env,
            check=False,
        )
        if result.returncode != 0:
            raise HarnessError("A local database command failed.")
        return [line.split("\x1f") for line in result.stdout.splitlines() if line]

    def execute(self, sql: str) -> None:
        self.rows(sql)

    def preflight(self) -> None:
        rows = self.rows(
            """
            SELECT current_database(), count(*)::text
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN (
                'User', 'Team', 'AthleteProfile', 'CoachTeamMembership',
                'TrainingEntry', 'ProofImage', 'EvidenceExtractionJob',
                'AthleteWeeklyRequirementOverride', 'AuditLog'
              )
            GROUP BY current_database();
            """
        )
        require(
            rows == [[EXPECTED_DATABASE, "9"]],
            "The local test database is missing required migrated tables.",
        )


class SupabaseAdmin:
    def __init__(self) -> None:
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.anon_key = os.environ.get("SUPABASE_ANON_KEY", "")
        self.service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "")
        parsed = urllib.parse.urlparse(self.url)
        is_local_http = parsed.scheme == "http" and parsed.hostname in LOCAL_HOSTS
        require(
            (parsed.scheme == "https" or is_local_http) and bool(parsed.hostname),
            "SUPABASE_URL must be HTTPS, except for a local Supabase URL.",
        )
        require(bool(self.anon_key), "SUPABASE_ANON_KEY is required.")
        require(bool(self.service_key), "SUPABASE_SERVICE_ROLE_KEY is required.")
        require(bool(self.bucket), "SUPABASE_STORAGE_BUCKET is required.")
        self.project_ref = (parsed.hostname or "").split(".")[0]

    def ensure_storage_bucket(self) -> bool:
        existing = self._request(
            "GET",
            "/storage/v1/bucket",
            key=self.service_key,
            operation="Supabase Storage bucket lookup",
        )
        require(isinstance(existing, list), "Supabase Storage bucket lookup returned no list.")
        if any(isinstance(item, dict) and item.get("id") == self.bucket for item in existing):
            return False
        self._request(
            "POST",
            "/storage/v1/bucket",
            key=self.service_key,
            operation="Supabase Storage bucket creation",
            body={
                "id": self.bucket,
                "name": self.bucket,
                "public": False,
                "file_size_limit": 10485760,
                "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"],
            },
        )
        return True

    def _request(
        self,
        method: str,
        path: str,
        *,
        key: str,
        operation: str,
        body: dict[str, object] | None = None,
        allowed_statuses: set[int] | None = None,
    ) -> dict[str, object] | list[object] | None:
        payload = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            f"{self.url}{path}",
            data=payload,
            method=method,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as error:
            error.read()
            if allowed_statuses and error.code in allowed_statuses:
                return None
            raise HarnessError(f"{operation} failed with HTTP {error.code}.") from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            raise HarnessError(f"{operation} failed without a usable response.") from None

    def create_user(self, email: str, password: str) -> str:
        response = self._request(
            "POST",
            "/auth/v1/admin/users",
            key=self.service_key,
            operation="Supabase Auth user creation",
            body={
                "email": email,
                "password": password,
                "email_confirm": True,
            },
        )
        require(isinstance(response, dict), "Supabase Auth user creation returned no user.")
        user = response.get("user", response)
        require(isinstance(user, dict) and isinstance(user.get("id"), str), "Supabase Auth user creation returned no ID.")
        return user["id"]

    def sign_in(self, email: str, password: str) -> dict[str, object]:
        response = self._request(
            "POST",
            "/auth/v1/token?grant_type=password",
            key=self.anon_key,
            operation="Supabase password sign-in",
            body={"email": email, "password": password},
        )
        require(isinstance(response, dict), "Supabase sign-in returned no session.")
        require(
            isinstance(response.get("access_token"), str)
            and isinstance(response.get("refresh_token"), str)
            and isinstance(response.get("user"), dict),
            "Supabase sign-in returned an incomplete session.",
        )
        if not response.get("expires_at"):
            expires_in = response.get("expires_in")
            require(isinstance(expires_in, (int, float)), "Supabase session has no expiry.")
            response["expires_at"] = int(time.time() + expires_in)
        # auth.setSession() persists the session fields, not this endpoint-only hint.
        response.pop("weak_password", None)
        return response

    def delete_storage_objects(self, paths: list[str]) -> None:
        if not paths:
            return
        bucket = urllib.parse.quote(self.bucket, safe="")
        self._request(
            "DELETE",
            f"/storage/v1/object/{bucket}",
            key=self.service_key,
            operation="Supabase Storage object cleanup",
            body={"prefixes": paths},
            allowed_statuses={404},
        )

    def delete_storage_bucket(self) -> None:
        bucket = urllib.parse.quote(self.bucket, safe="")
        self._request(
            "DELETE",
            f"/storage/v1/bucket/{bucket}",
            key=self.service_key,
            operation="Supabase Storage bucket cleanup",
            allowed_statuses={404},
        )

    def delete_user(self, user_id: str) -> None:
        encoded_id = urllib.parse.quote(user_id, safe="")
        self._request(
            "DELETE",
            f"/auth/v1/admin/users/{encoded_id}",
            key=self.service_key,
            operation="Supabase Auth user cleanup",
            body={"should_soft_delete": False},
            allowed_statuses={404},
        )


def session_cookies(
    base_url: str,
    project_ref: str,
    session: dict[str, object],
) -> list[dict[str, object]]:
    cookie_script = """
      import { createServerClient } from '@supabase/ssr';
      const tokens = JSON.parse(await new Promise((resolve) => {
        let input = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { input += chunk; });
        process.stdin.on('end', () => resolve(input));
      }));
      const writes = [];
      const client = createServerClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { cookies: { getAll: () => [], setAll: (items) => writes.push(...items) } },
      );
      const { error } = await client.auth.setSession(tokens);
      if (error) process.exit(2);
      process.stdout.write(JSON.stringify(
        writes.filter((item) => item.value).map(({ name, value }) => ({ name, value })),
      ));
    """
    result = subprocess.run(
        ["node", "--input-type=module", "--eval", cookie_script],
        input=json.dumps(
            {
                "access_token": session["access_token"],
                "refresh_token": session["refresh_token"],
            }
        ),
        text=True,
        capture_output=True,
        cwd=ROOT,
        env=os.environ.copy(),
        check=False,
    )
    if result.returncode != 0:
        raise HarnessError("Supabase SSR could not create the authenticated cookie.")
    try:
        emitted = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise HarnessError("Supabase SSR returned an unreadable cookie.") from None
    require(
        isinstance(emitted, list)
        and bool(emitted)
        and all(
            isinstance(item, dict)
            and isinstance(item.get("name"), str)
            and isinstance(item.get("value"), str)
            for item in emitted
        ),
        "Supabase SSR returned no authenticated cookie.",
    )
    require(
        all(str(item["name"]).startswith(f"sb-{project_ref}-auth-token") for item in emitted),
        "Supabase SSR returned an unexpected cookie namespace.",
    )
    return [
        {
            "name": item["name"],
            "value": item["value"],
            "url": base_url,
            "sameSite": "Lax",
            "httpOnly": False,
            "secure": base_url.startswith("https://"),
        }
        for item in emitted
    ]


def open_authenticated_page(
    browser: Browser,
    base_url: str,
    project_ref: str,
    session: dict[str, object],
    path: str,
) -> tuple[BrowserContext, Page, list[str]]:
    try:
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        context.add_cookies(session_cookies(base_url, project_ref, session))
    except Exception:
        raise HarnessError("Authenticated browser context setup failed.") from None
    page_errors: list[str] = []
    try:
        page = context.new_page()
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        response = page.goto(f"{base_url}{path}", wait_until="domcontentloaded")
    except Exception:
        context.close()
        raise HarnessError("Authenticated navigation to the local app failed.") from None
    try:
        page.wait_for_load_state("networkidle", timeout=5_000)
    except PlaywrightTimeoutError:
        # Supabase refresh and the Next.js development channel can stay open.
        pass
    require(response is not None and response.status < 500, "An authenticated page failed to load.")
    return context, page, page_errors


def wait_for_database(check, *, timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.2)
    raise HarnessError("Timed out waiting for the saved database state.")


def seed_local_rows(
    pg: LocalPostgres,
    *,
    athlete_id: str,
    athlete_email: str,
    coach_id: str,
    coach_email: str,
    team_id: str,
    athlete_profile_id: str,
) -> None:
    pg.execute(
        f"""
        BEGIN;
        INSERT INTO "User" (id, email, name, role, status, "createdAt", "updatedAt")
        VALUES
          ({sql_literal(athlete_id)}, {sql_literal(athlete_email)}, {sql_literal(ATHLETE_NAME)}, 'ATHLETE', 'ACTIVE', NOW(), NOW()),
          ({sql_literal(coach_id)}, {sql_literal(coach_email)}, {sql_literal(COACH_NAME)}, 'COACH', 'ACTIVE', NOW(), NOW());
        INSERT INTO "Team" (id, name, timezone, "createdAt", "updatedAt")
        VALUES ({sql_literal(team_id)}, {sql_literal(TEAM_NAME)}, 'America/New_York', NOW(), NOW());
        INSERT INTO "AthleteProfile" (id, "userId", "teamId", "createdAt", "updatedAt")
        VALUES ({sql_literal(athlete_profile_id)}, {sql_literal(athlete_id)}, {sql_literal(team_id)}, NOW(), NOW());
        INSERT INTO "CoachTeamMembership" ("teamId", "coachId", "createdAt")
        VALUES ({sql_literal(team_id)}, {sql_literal(coach_id)}, NOW());
        COMMIT;
        """
    )


def storage_paths(pg: LocalPostgres, athlete_id: str) -> list[str]:
    return [
        row[0]
        for row in pg.rows(
            f'SELECT "storagePath" FROM "ProofImage" WHERE "athleteId" = {sql_literal(athlete_id)};'
        )
    ]


def cleanup_local_rows(
    pg: LocalPostgres,
    *,
    athlete_id: str,
    coach_id: str,
    team_id: str,
) -> None:
    athlete = sql_literal(athlete_id)
    coach = sql_literal(coach_id)
    team = sql_literal(team_id)
    pg.execute(
        f"""
        BEGIN;
        DELETE FROM "AuditLog" WHERE "actorId" IN ({athlete}, {coach});
        DELETE FROM "WeeklyRecapDelivery" WHERE "teamId" = {team} OR "userId" IN ({athlete}, {coach});
        DELETE FROM "WeeklyAggregate" WHERE "teamId" = {team} OR "athleteId" = {athlete};
        DELETE FROM "EvidenceExtractionJob" WHERE "athleteId" = {athlete};
        DELETE FROM "ProofExtractionJob"
          WHERE "proofImageId" IN (SELECT id FROM "ProofImage" WHERE "athleteId" = {athlete});
        UPDATE "ProofImage" SET "trainingEntryId" = NULL WHERE "athleteId" = {athlete};
        UPDATE "TrainingEntry" SET "proofImageId" = NULL WHERE "athleteId" = {athlete};
        DELETE FROM "ExternalActivity" WHERE "athleteId" = {athlete};
        DELETE FROM "ConnectedAccount" WHERE "athleteId" = {athlete};
        DELETE FROM "TrainingEntry" WHERE "athleteId" = {athlete};
        DELETE FROM "ProofImage" WHERE "athleteId" = {athlete};
        DELETE FROM "AthleteWeeklyRequirementOverride"
          WHERE "athleteId" = {athlete} OR "createdBy" = {coach};
        DELETE FROM "Exemption" WHERE "athleteId" = {athlete} OR "createdBy" = {coach};
        DELETE FROM "WeeklyRequirement" WHERE "teamId" = {team};
        DELETE FROM "Session" WHERE "userId" IN ({athlete}, {coach});
        DELETE FROM "AthleteProfile" WHERE "userId" = {athlete} OR "teamId" = {team};
        DELETE FROM "CoachTeamMembership" WHERE "teamId" = {team} OR "coachId" = {coach};
        DELETE FROM "User" WHERE id IN ({athlete}, {coach});
        DELETE FROM "Team" WHERE id = {team};
        COMMIT;
        """
    )


def run_athlete_flow(
    browser: Browser,
    pg: LocalPostgres,
    base_url: str,
    project_ref: str,
    session: dict[str, object],
    athlete_id: str,
) -> tuple[str, str]:
    context, page, page_errors = open_authenticated_page(
        browser, base_url, project_ref, session, "/athlete/log"
    )
    stage = "authenticated page render"
    try:
        if urllib.parse.urlparse(page.url).path == "/login":
            raise HarnessError("The local app rejected the synthesized Supabase session cookie.")
        expect(page.get_by_role("heading", name="Log workout")).to_be_visible(timeout=20_000)
        stage = "Garmin and Strava upload"
        page.locator("#proof").set_input_files([str(path) for path in FIXTURES])
        proof_items = page.locator("[aria-label='Proof photos'] > li")
        expect(proof_items).to_have_count(2, timeout=60_000)
        for index in range(2):
            expect(proof_items.nth(index)).to_contain_text("Photo uploaded", timeout=120_000)
        expect(page.get_by_text("2 photos ready.", exact=True)).to_be_attached(timeout=20_000)

        stage = "workout form entry"
        page.get_by_role("button", name="Run", exact=True).click()
        page.locator("#minutes").fill("42")
        page.locator("#distanceKm").fill("10")
        page.locator("#avgHr").fill("150")
        page.locator("#notes").fill("Authenticated E2E save verification")
        stage = "workout save acknowledgement"
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_role("status").filter(has_text="Workout saved.")).to_contain_text(
            "Checking photo in the background.", timeout=30_000
        )
        require(page_errors == [], "The athlete workflow emitted a browser page error.")
    except HarnessError:
        raise
    except Exception:
        if stage == "authenticated page render":
            body_text = page.locator("body").inner_text()
            if "Unable to verify your session." in body_text:
                raise HarnessError("The authenticated route reported a session verification error.") from None
            if "Redirecting to login..." in body_text:
                raise HarnessError("The authenticated route received an empty application session.") from None
            if page_errors:
                raise HarnessError("The authenticated route emitted a browser page error before rendering.") from None
            if not body_text.strip():
                raise HarnessError("The authenticated athlete layout remained in its loading fallback.") from None
        raise HarnessError(f"The athlete {stage} failed.") from None
    finally:
        context.close()

    entries = pg.rows(
        f"""
        SELECT id, version::text, "validationStatus"::text
        FROM "TrainingEntry"
        WHERE "athleteId" = {sql_literal(athlete_id)}
        ORDER BY "createdAt";
        """
    )
    require(len(entries) == 1, "The UI save did not create exactly one workout.")
    entry_id, version, validation_status = entries[0]
    require(version == "1" and validation_status == "PENDING", "The saved workout has an unexpected initial state.")

    proofs = pg.rows(
        f"""
        SELECT count(*)::text
        FROM "ProofImage"
        WHERE "athleteId" = {sql_literal(athlete_id)}
          AND "trainingEntryId" = {sql_literal(entry_id)}
          AND "uploadedAt" IS NOT NULL
          AND "attachedAt" IS NOT NULL
          AND "deletedAt" IS NULL
          AND "validationStatus" = 'PENDING';
        """
    )
    require(proofs == [["2"]], "The saved workout does not have two confirmed proof images.")

    jobs = pg.rows(
        f"""
        SELECT id, status::text, "entryId"
        FROM "EvidenceExtractionJob"
        WHERE "athleteId" = {sql_literal(athlete_id)};
        """
    )
    require(len(jobs) == 1 and jobs[0][1:] == ["PENDING", entry_id], "The save did not enqueue one extraction job.")
    return entry_id, jobs[0][0]


def put_entry_in_review_queue(pg: LocalPostgres, job_id: str) -> None:
    pg.execute(
        f"""
        UPDATE "EvidenceExtractionJob"
        SET status = 'FAILED', attempts = 3, "failureCode" = 'E2E_INJECTED',
            "lastError" = 'Synthetic terminal state', "updatedAt" = NOW()
        WHERE id = {sql_literal(job_id)};
        """
    )


def run_coach_flow(
    browser: Browser,
    pg: LocalPostgres,
    base_url: str,
    project_ref: str,
    session: dict[str, object],
    *,
    athlete_id: str,
    coach_id: str,
    team_id: str,
    entry_id: str,
) -> None:
    context, page, page_errors = open_authenticated_page(
        browser,
        base_url,
        project_ref,
        session,
        f"/coach/review?teamId={urllib.parse.quote(team_id, safe='')}",
    )
    try:
        expect(page.get_by_role("heading", name="Review workouts")).to_be_visible(timeout=20_000)
        entry = page.locator("article").filter(has_text=ATHLETE_NAME)
        expect(entry).to_have_count(1, timeout=20_000)
        expect(entry).to_contain_text("Photo check needs help")
        entry.get_by_role("button", name="Approve", exact=True).click()
        expect(entry).to_have_count(0, timeout=20_000)
        expect(page.get_by_text("Nothing needs review", exact=True)).to_be_visible(timeout=20_000)

        def review_saved() -> bool:
            rows = pg.rows(
                f"""
                SELECT version::text, "validationStatus"::text, COALESCE("reviewedById", '')
                FROM "TrainingEntry" WHERE id = {sql_literal(entry_id)};
                """
            )
            return rows == [["2", "VERIFIED", coach_id]]

        wait_for_database(review_saved)
        proof_rows = pg.rows(
            f"""
            SELECT count(*)::text FROM "ProofImage"
            WHERE "trainingEntryId" = {sql_literal(entry_id)}
              AND "validationStatus" = 'VERIFIED'
              AND "reviewedById" = {sql_literal(coach_id)};
            """
        )
        require(proof_rows == [["2"]], "Coach approval did not advance both proofs.")
        audit_rows = pg.rows(
            f"""
            SELECT count(*)::text FROM "AuditLog"
            WHERE "actorId" = {sql_literal(coach_id)}
              AND "entityType" = 'TRAINING_ENTRY'
              AND "entityId" = {sql_literal(entry_id)}
              AND action = 'REVIEW_VALIDATION';
            """
        )
        require(audit_rows == [["1"]], "Coach approval did not create its audit record.")

        response = page.goto(
            f"{base_url}/coach/settings?teamId={urllib.parse.quote(team_id, safe='')}",
            wait_until="domcontentloaded",
        )
        require(response is not None and response.status < 500, "Coach settings failed to load.")
        expect(page.get_by_role("heading", name="Weekly settings")).to_be_visible(timeout=20_000)
        settings_row = page.locator("tbody tr").filter(has_text=ATHLETE_NAME)
        expect(settings_row).to_have_count(1, timeout=20_000)
        settings_row.locator("input[type='number']").fill("180")
        settings_row.locator("input:not([type='number'])").fill("E2E weekly adjustment")
        save_button = settings_row.get_by_role("button", name="Save", exact=True)
        expect(save_button).to_be_enabled()
        save_button.click()

        def setting_saved() -> bool:
            rows = pg.rows(
                f"""
                SELECT "requiredMinutes"::text, COALESCE(reason, ''), "createdBy"
                FROM "AthleteWeeklyRequirementOverride"
                WHERE "athleteId" = {sql_literal(athlete_id)};
                """
            )
            return rows == [["180", "E2E weekly adjustment", coach_id]]

        wait_for_database(setting_saved)
        expect(save_button).to_have_text("Save", timeout=20_000)
        expect(save_button).to_be_disabled()
        expect(settings_row).not_to_contain_text("Unsaved")
        setting_audit = pg.rows(
            f"""
            SELECT count(*)::text FROM "AuditLog"
            WHERE "actorId" = {sql_literal(coach_id)}
              AND "entityType" = 'ATHLETE_WEEKLY_SETTING'
              AND "entityId" = {sql_literal(athlete_id)}
              AND action = 'REPLACE';
            """
        )
        require(setting_audit == [["1"]], "The settings save did not create its audit record.")

        page.evaluate("sessionStorage.setItem('rowbook:e2e-marker', 'temporary')")
        page.get_by_role("button", name="Open user menu").click()
        page.get_by_role("menuitem", name="Log out", exact=True).click()
        page.wait_for_url(f"{base_url}/login", timeout=20_000)
        require(
            page.evaluate("sessionStorage.getItem('rowbook:e2e-marker')") is None,
            "Logout did not clear Rowbook session storage.",
        )
        page.goto(f"{base_url}/coach", wait_until="domcontentloaded")
        page.wait_for_url(f"{base_url}/login", timeout=20_000)
        expect(page.get_by_role("heading", name="Log in to continue")).to_be_visible()
        require(page_errors == [], "The coach workflow emitted a browser page error.")
    except HarnessError:
        raise
    except Exception:
        raise HarnessError("The coach review, settings, or logout workflow failed.") from None
    finally:
        context.close()


def verify_cleanup(pg: LocalPostgres, athlete_id: str, coach_id: str, team_id: str) -> None:
    rows = pg.rows(
        f"""
        SELECT
          (SELECT count(*) FROM "User" WHERE id IN ({sql_literal(athlete_id)}, {sql_literal(coach_id)}))::text,
          (SELECT count(*) FROM "Team" WHERE id = {sql_literal(team_id)})::text,
          (SELECT count(*) FROM "ProofImage" WHERE "athleteId" = {sql_literal(athlete_id)})::text,
          (SELECT count(*) FROM "TrainingEntry" WHERE "athleteId" = {sql_literal(athlete_id)})::text;
        """
    )
    require(rows == [["0", "0", "0", "0"]], "Local E2E cleanup was incomplete.")


def main() -> int:
    if os.environ.get("ROWBOOK_E2E_AUTHENTICATED") != "1":
        print("SKIP: set ROWBOOK_E2E_AUTHENTICATED=1 to run authenticated E2E.")
        return 0

    base_url = os.environ.get("E2E_BASE_URL", "http://localhost:3100").rstrip("/")
    parsed_base = urllib.parse.urlparse(base_url)
    require(parsed_base.scheme in {"http", "https"}, "E2E_BASE_URL must be HTTP(S).")
    require(parsed_base.hostname in LOCAL_HOSTS, "E2E_BASE_URL must use a local host.")
    require(all(path.is_file() for path in FIXTURES), "Garmin and Strava fixtures are required.")
    require(
        os.environ.get("ROWBOOK_DISABLE_BACKGROUND_JOBS") == "1",
        "ROWBOOK_DISABLE_BACKGROUND_JOBS=1 is required for deterministic review state.",
    )

    pg = LocalPostgres(os.environ.get("DATABASE_URL", ""))
    supabase = SupabaseAdmin()
    pg.preflight()
    print("PASS: guarded local database and fixture preflight")

    run_id = secrets.token_hex(8)
    athlete_id = str(uuid.uuid4())
    coach_id = str(uuid.uuid4())
    team_id = str(uuid.uuid4())
    athlete_profile_id = str(uuid.uuid4())
    athlete_email = f"rowbook-e2e-{run_id}-athlete@example.com"
    coach_email = f"rowbook-e2e-{run_id}-coach@example.com"
    athlete_password = secrets.token_urlsafe(32)
    coach_password = secrets.token_urlsafe(32)

    primary_error: Exception | None = None
    cleanup_errors: list[str] = []
    storage_objects: list[str] = []
    auth_user_ids: list[str] = []
    storage_bucket_created = False
    try:
        storage_bucket_created = supabase.ensure_storage_bucket()
        athlete_id = supabase.create_user(athlete_email, athlete_password)
        auth_user_ids.append(athlete_id)
        coach_id = supabase.create_user(coach_email, coach_password)
        auth_user_ids.append(coach_id)
        seed_local_rows(
            pg,
            athlete_id=athlete_id,
            athlete_email=athlete_email,
            coach_id=coach_id,
            coach_email=coach_email,
            team_id=team_id,
            athlete_profile_id=athlete_profile_id,
        )
        athlete_session = supabase.sign_in(athlete_email, athlete_password)
        coach_session = supabase.sign_in(coach_email, coach_password)
        print("PASS: temporary authenticated users and local memberships")

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                entry_id, job_id = run_athlete_flow(
                    browser,
                    pg,
                    base_url,
                    supabase.project_ref,
                    athlete_session,
                    athlete_id,
                )
                storage_objects = storage_paths(pg, athlete_id)
                print("PASS: Garmin and Strava upload, workout save, and persisted-state checks")
                put_entry_in_review_queue(pg, job_id)
                run_coach_flow(
                    browser,
                    pg,
                    base_url,
                    supabase.project_ref,
                    coach_session,
                    athlete_id=athlete_id,
                    coach_id=coach_id,
                    team_id=team_id,
                    entry_id=entry_id,
                )
                print("PASS: coach review, weekly setting, session cleanup, and logout")
            finally:
                browser.close()
    except Exception as error:
        primary_error = error
    finally:
        if not storage_objects:
            try:
                storage_objects = storage_paths(pg, athlete_id)
            except Exception:
                cleanup_errors.append("storage path discovery")
        try:
            supabase.delete_storage_objects(storage_objects)
        except Exception:
            cleanup_errors.append("Supabase Storage")
        if storage_bucket_created:
            try:
                supabase.delete_storage_bucket()
            except Exception:
                cleanup_errors.append("Supabase Storage bucket")
        try:
            cleanup_local_rows(
                pg,
                athlete_id=athlete_id,
                coach_id=coach_id,
                team_id=team_id,
            )
            verify_cleanup(pg, athlete_id, coach_id, team_id)
        except Exception:
            cleanup_errors.append("local database")
        for user_id in auth_user_ids:
            try:
                supabase.delete_user(user_id)
            except Exception:
                cleanup_errors.append("Supabase Auth")

    if cleanup_errors:
        print("FAIL: cleanup was incomplete: " + ", ".join(sorted(set(cleanup_errors))))
        return 1
    print("PASS: temporary Auth, Storage, browser, and local database artifacts cleaned")
    if primary_error is not None:
        message = str(primary_error) if isinstance(primary_error, HarnessError) else "Authenticated E2E failed unexpectedly."
        print(f"FAIL: {message}")
        return 1
    print("PASS: authenticated E2E")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except HarnessError as error:
        print(f"FAIL: {error}")
        raise SystemExit(1) from None
