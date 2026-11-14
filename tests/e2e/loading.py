"""Startup loading checks using intercepted APIs, without accounts or DB writes.

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


class LoadingServer:
    def __init__(self, role="ATHLETE"):
        self.role, self.calls, self.held, self.hold = role, [], [], set()
        self.fail_recap = False

    def intercept(self, route):
        parsed = urlparse(route.request.url)
        names = unquote(parsed.path.split("/api/trpc/")[1]).split(",")
        query = parse_qs(parsed.query)
        raw = json.loads(query.get("input", ["{}"])[0])
        payloads = []
        for index, name in enumerate(names):
            value = raw.get(str(index), {}).get("json")
            self.calls.append((name, value))
            if name == "auth.getSession":
                payload = response({"user": {"id": "loading-user", "name": "Loading test", "email": "loading@example.test", "role": self.role, "status": "ACTIVE"}, "expiresAt": "2027-01-01T00:00:00.000Z"}, ["expiresAt"])
            elif name == "weeklyReveal.getPending":
                payload = Server.error(name) if self.fail_recap else response(None)
            elif name == "coach.listTeams":
                payload = response([{"id": "loading-team", "name": "Loading test team"}])
            elif name == "coach.listAthletes":
                payload = response([])
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
        return r.left === 0 && r.top === 0 && Math.abs(r.width-innerWidth) <= 1
            && Math.abs(r.height-innerHeight) <= 1 && document.documentElement.scrollWidth <= innerWidth
            && root.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2));
    }"""), label
    animations = loader.evaluate("root => root.getAnimations({subtree:true}).length")
    assert (animations == 0) if reduced else (animations > 0), (label, animations)
    assert not page.get_by_text("Checking your weekly recap...", exact=True).count()
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
        page.get_by_role("button", name="Try again").click()
        expect(page.get_by_role("alertdialog")).to_have_count(0)
        expect(loading(page)).to_have_count(0)
        expect(page.locator("[inert]")).to_have_count(0)
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
            print("Loading checks passed: responsive animation, startup, background refresh, coach request, retry.")
        finally:
            browser.close()
