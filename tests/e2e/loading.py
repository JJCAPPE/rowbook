"""Loading checks using intercepted APIs, without accounts or DB writes.

Run against local Next: E2E_BASE_URL=http://localhost:3100 python tests/e2e/loading.py
"""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import expect, sync_playwright

from weekly_reveal import Server, response


BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:3100")
OUTPUT = Path("tmp/loading")
WEEK_START = "2026-11-09T01:00:00.000Z"
WEEK_END = "2026-11-16T01:00:00.000Z"


class LoadingServer:
    def __init__(self, role="ATHLETE"):
        self.role, self.calls, self.held, self.hold = role, [], [], set()
        self.fail_recap = False
        self.fail = set()
        self.history = []

    def intercept(self, route):
        parsed = urlparse(route.request.url)
        names = unquote(parsed.path.split("/api/trpc/")[1]).split(",")
        query = parse_qs(parsed.query)
        raw = route.request.post_data_json if route.request.method == "POST" else json.loads(query.get("input", ["{}"])[0])
        payloads = []
        for index, name in enumerate(names):
            value = raw.get(str(index), {}).get("json")
            self.calls.append((name, value))
            if name in self.fail:
                payload = Server.error(name)
            elif name == "auth.getSession":
                payload = response({"user": {"id": "loading-user", "name": "Loading test", "email": "loading@example.test", "role": self.role, "status": "ACTIVE"}, "expiresAt": "2027-01-01T00:00:00.000Z"}, ["expiresAt"])
            elif name == "weeklyReveal.getPending":
                payload = Server.error(name) if self.fail_recap else response(None)
            elif name == "coach.listTeams":
                payload = response([{"id": "loading-team", "name": "Loading test team"}])
            elif name in ("coach.listAthletes", "coach.getWeeklyRequirementsRange"):
                payload = response([])
            elif name == "athlete.getHistoryWithEntries":
                dates = [f"{index}.{key}" for index, week in enumerate(self.history)
                         for key in ("weekStartAt", "weekEndAt", *(f"entries.{n}.date" for n in range(len(week["entries"]))))]
                payload = response(self.history, dates)
            elif name == "athlete.deleteEntry":
                payload = response(None)
            elif name == "athlete.getDashboard":
                payload = response({"weekStartAt": WEEK_START}, ["weekStartAt"])
            elif name == "coach.getWeeklySettings":
                payload = response({"teamId": "loading-team", "weekStartAt": WEEK_START, "weekEndAt": WEEK_END, "isCurrentWeek": True, "requiredMinutes": 120, "athleteTargets": [], "athletes": [], "exemptions": [], "overrides": []}, ["weekStartAt", "weekEndAt"])
            elif name == "athlete.getWeekDetail":
                payload = response({"weekStartAt": WEEK_START, "weekEndAt": WEEK_END, "totalMinutes": 30, "totalDistanceKm": 5, "sessions": 1, "entries": [{"id": "loading-entry", "version": 1, "date": WEEK_START, "activityType": "RUN", "minutes": 30, "distance": 5, "avgHr": None, "avgPace": None, "avgWatts": None, "validationStatus": "VERIFIED", "extractedFields": None, "proofs": [{"id": "loading-proof", "available": True}]}]}, ["weekStartAt", "weekEndAt", "entries.0.date"])
            elif name == "athlete.getEntryEvidence":
                payload = response({"entryId": "loading-entry", "version": 1, "images": [{"id": "loading-proof", "src": "data:image/png;base64,invalid"}]})
            elif name in ("athlete.getLeaderboard", "coach.getTeamOverview"):
                payload = response({"leaderboard": [], "teamStats": {"totalMinutes": 0, "totalDistance": 0, "avgHr": None}, "teamTrend": [], "requiredMinutes": 120, "pendingProofCount": 0, "missingMinutesCount": 0, "summary": {"met": 0, "notMet": 0, "exempt": 0}})
            else:
                raise AssertionError(f"Unexpected API: {name}")
            payloads.append(payload)
        item = (route, names, payloads if "batch" in query else payloads[0])
        if self.hold.intersection(names):
            self.held.append(item)
        else:
            self.fulfill(item)

    @staticmethod
    def fulfill(item):
        route, _, payload = item
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload))

    def release(self, name):
        self.hold.discard(name)
        for item in self.held[:]:
            if not self.hold.intersection(item[1]):
                self.held.remove(item)
                self.fulfill(item)

    def count(self, name):
        return sum(call == name for call, _ in self.calls)


def wait_for_call(page, server, name, count=1):
    for _ in range(200):
        if server.count(name) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"Missing request: {name}; received {server.calls}")


def loading(page):
    return page.get_by_role("status", name="Loading Rowbook")


def check_loader(page, label, reduced=False):
    loader = loading(page)
    expect(loader).to_be_visible()
    expect(loader).to_have_text("#Temple")
    assert loader.evaluate("""root => {
        const r = root.getBoundingClientRect();
        // A stable scrollbar gutter reserves space outside the root content box.
        const contentWidth = document.documentElement.getBoundingClientRect().width;
        return r.left === 0 && r.top === 0 && r.width >= contentWidth - 1 && r.width <= innerWidth
            && Math.abs(r.height-innerHeight) <= 1 && document.documentElement.scrollWidth <= innerWidth
            && root.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2));
    }"""), label
    animations = loader.evaluate("root => root.getAnimations({subtree:true}).length")
    assert (animations == 0) if reduced else (animations > 0), (label, animations)
    assert not page.get_by_text("Checking your weekly recap...", exact=True).count()
    assert not page.get_by_text("Checking...", exact=True).is_visible()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(OUTPUT / f"{label}.png"))


def open_page(browser, server, path, viewport=(1440, 900), reduced=False):
    context = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, reduced_motion="reduce" if reduced else "no-preference")
    context.route("**/api/trpc/**", server.intercept)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE_URL + path, wait_until="domcontentloaded")
    return context, page, errors


def startup(browser, label, viewport, reduced=False):
    server = LoadingServer()
    server.hold = {"auth.getSession", "weeklyReveal.getPending", "athlete.getLeaderboard"}
    context, page, errors = open_page(browser, server, "/athlete/leaderboard", viewport, reduced)
    try:
        wait_for_call(page, server, "auth.getSession")
        check_loader(page, f"{label}-session", reduced)
        server.release("auth.getSession")
        wait_for_call(page, server, "weeklyReveal.getPending")
        wait_for_call(page, server, "athlete.getLeaderboard")
        check_loader(page, f"{label}-data", reduced)
        expect(page.locator("[inert]")).to_have_count(1)
        server.release("weeklyReveal.getPending")
        expect(loading(page)).to_be_visible()
        server.release("athlete.getLeaderboard")
        expect(loading(page)).to_have_count(0)
        expect(page.get_by_role("heading", name="Weekly leaderboard")).to_be_visible()
        expect(page.locator("[inert]")).to_have_count(0)

        previous = server.count("weeklyReveal.getPending")
        server.hold = {"weeklyReveal.getPending", "athlete.getLeaderboard"}
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        wait_for_call(page, server, "weeklyReveal.getPending", previous + 1)
        expect(loading(page)).to_have_count(0)
        expect(page.locator("[inert]")).to_have_count(0)
        server.release("weeklyReveal.getPending")
        server.release("athlete.getLeaderboard")
        assert not errors, errors
    finally:
        context.close()


def coach_startup(browser):
    server = LoadingServer("COACH")
    context, page, errors = open_page(browser, server, "/coach")
    try:
        expect(page.get_by_role("heading", name="Team overview")).to_be_visible()
        expect(loading(page)).to_have_count(0)
        overview_calls = [value for name, value in server.calls if name == "coach.getTeamOverview"]
        assert overview_calls == [{"teamId": "loading-team"}], overview_calls
        server.hold = {"coach.getWeeklySettings", "coach.getWeeklyRequirementsRange"}
        page.get_by_role("link", name="Settings", exact=True).click()
        wait_for_call(page, server, "coach.getWeeklySettings")
        check_loader(page, "coach-settings")
        server.release("coach.getWeeklySettings")
        wait_for_call(page, server, "coach.getWeeklyRequirementsRange")
        check_loader(page, "coach-schedule")
        server.release("coach.getWeeklyRequirementsRange")
        expect(loading(page)).to_have_count(0)
        expect(page.get_by_role("heading", name="Weekly settings")).to_be_visible()
        assert not errors, errors
    finally:
        context.close()


def recap_error(browser):
    server = LoadingServer()
    server.fail_recap = True
    context, page, errors = open_page(browser, server, "/athlete/leaderboard")
    try:
        expect(page.get_by_role("alertdialog")).to_be_visible(timeout=10000)
        expect(page.get_by_role("button", name="Try again")).to_be_visible()
        server.fail_recap = False
        server.hold = {"weeklyReveal.getPending"}
        page.get_by_role("button", name="Try again").click()
        check_loader(page, "recap-retry")
        server.release("weeklyReveal.getPending")
        expect(page.get_by_role("alertdialog")).to_have_count(0)
        expect(loading(page)).to_have_count(0)
        expect(page.locator("[inert]")).to_have_count(0)
        assert not errors, errors
    finally:
        context.close()


def navigate_after_startup(browser):
    server = LoadingServer()
    context, page, errors = open_page(browser, server, "/athlete/leaderboard")
    try:
        expect(loading(page)).to_have_count(0)
        expect(page.get_by_role("heading", name="Weekly leaderboard")).to_be_visible()
        previous = server.count("athlete.getLeaderboard")
        server.hold = {"athlete.getLeaderboard"}
        page.get_by_role("combobox", name="Week", exact=True).select_option(index=1)
        wait_for_call(page, server, "athlete.getLeaderboard", previous + 1)
        check_loader(page, "week-change")
        server.release("athlete.getLeaderboard")
        expect(loading(page)).to_have_count(0)
        server.hold = {"athlete.getHistoryWithEntries"}
        page.get_by_role("link", name="History", exact=True).click()
        wait_for_call(page, server, "athlete.getHistoryWithEntries")
        check_loader(page, "history-navigation")
        page.go_back(wait_until="domcontentloaded")
        expect(loading(page)).to_have_count(0)
        expect(page.get_by_role("heading", name="Weekly leaderboard")).to_be_visible()
        assert any("athlete.getHistoryWithEntries" in names for _, names, _ in server.held)
        server.release("athlete.getHistoryWithEntries")
        page.get_by_role("link", name="History", exact=True).click()
        expect(page.get_by_role("heading", name="Weekly history")).to_be_visible()
        assert not errors, errors
    finally:
        context.close()


def account_retry(browser):
    for role, path, api in (("ATHLETE", "/athlete/leaderboard", "auth.getSession"), ("COACH", "/coach", "coach.listTeams")):
        server = LoadingServer(role)
        server.fail = {api}
        context, page, errors = open_page(browser, server, path)
        try:
            expect(page.get_by_role("button", name="Try again", exact=True)).to_be_visible()
            server.fail.clear()
            server.hold = {api}
            page.get_by_role("button", name="Try again", exact=True).click()
            check_loader(page, f"{api}-retry")
            server.release(api)
            expect(loading(page)).to_have_count(0)
            heading = "Weekly leaderboard" if role == "ATHLETE" else "Team overview"
            expect(page.get_by_role("heading", name=heading)).to_be_visible()
            assert not errors, errors
        finally:
            context.close()


def confirm_delete(browser):
    server = LoadingServer()
    server.history = [{"weekStartAt": WEEK_START, "weekEndAt": WEEK_END,
                       "totalMinutes": 30, "status": "MET", "activityTypes": ["RUN"],
                       "hasHrData": False, "entries": [{"id": "delete-fixture", "version": 1,
                       "date": WEEK_START, "activityType": "RUN", "minutes": 30,
                       "distance": 5, "validationStatus": "VERIFIED"}]}]
    context, page, errors = open_page(browser, server, "/athlete/history", reduced=True)
    try:
        page.get_by_role("button", name="Delete entry", exact=True).click()
        dialog = page.get_by_role("dialog", name="Remove workout entry", exact=True)
        expect(dialog.get_by_role("button", name="Cancel", exact=True)).to_be_focused()
        server.fail = {"athlete.deleteEntry"}
        server.hold = {"athlete.deleteEntry"}
        dialog.get_by_role("button", name="Remove", exact=True).click()
        wait_for_call(page, server, "athlete.deleteEntry")
        expect(dialog.get_by_role("button", name="Cancel", exact=True)).to_be_disabled()
        page.keyboard.press("Escape")
        page.mouse.click(1, 1)
        expect(dialog).to_be_visible()
        server.release("athlete.deleteEntry")
        expect(dialog.get_by_role("alert")).to_be_visible()
        server.fail.clear()
        server.history = []
        dialog.get_by_role("button", name="Remove", exact=True).click()
        expect(dialog).to_have_count(0)
        expect(page.get_by_text("No weekly history yet.", exact=True)).to_be_visible()
        assert server.count("athlete.deleteEntry") == 2
        assert not errors, errors
    finally:
        context.close()


def nested_evidence(browser):
    server = LoadingServer()
    context, page, errors = open_page(browser, server, f"/athlete/week/{WEEK_START[:10]}")
    try:
        expect(page.get_by_role("button", name="Load evidence", exact=True)).to_be_visible()
        server.hold = {"athlete.getEntryEvidence"}
        page.get_by_role("button", name="Load evidence", exact=True).click()
        wait_for_call(page, server, "athlete.getEntryEvidence")
        check_loader(page, "nested-evidence")
        server.release("athlete.getEntryEvidence")
        expect(loading(page)).to_have_count(0)
        page.get_by_role("button", name="View proof", exact=True).click()
        dialog = page.get_by_role("dialog", name="Proof image", exact=True)
        expect(dialog.get_by_text("Proof image unavailable", exact=True)).to_be_visible()
        server.hold = {"athlete.getEntryEvidence"}
        dialog.get_by_role("button", name="Try again", exact=True).click()
        wait_for_call(page, server, "athlete.getEntryEvidence", 2)
        expect(dialog.get_by_role("status", name="Loading Rowbook")).to_have_text("#Temple")
        expect(dialog.get_by_role("status", name="Loading Rowbook")).to_be_visible()
        expect(page.locator("[inert]")).to_have_count(0)
        page.screenshot(path=str(OUTPUT / "proof-image-retry.png"))
        server.release("athlete.getEntryEvidence")
        expect(loading(page)).to_have_count(0)
        expect(dialog.get_by_text("Proof image unavailable", exact=True)).to_be_visible()
        dialog.get_by_role("button", name="Close", exact=True).click()
        expect(dialog).to_have_count(0)
        assert not errors, errors
    finally:
        context.close()


if __name__ == "__main__":
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            startup(browser, "desktop", (1440, 900))
            startup(browser, "phone", (390, 844))
            startup(browser, "narrow-reduced", (320, 568), reduced=True)
            coach_startup(browser)
            recap_error(browser)
            navigate_after_startup(browser)
            account_retry(browser)
            confirm_delete(browser)
            nested_evidence(browser)
            print("Loading checks passed: responsive animation, startup, background refresh, navigation, week changes, nested queries, retries.")
        finally:
            browser.close()
