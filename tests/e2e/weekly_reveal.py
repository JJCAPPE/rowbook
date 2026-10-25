"""Weekly awards UI checks and optional videos; all application APIs are intercepted.

Run against local Next: python tests/e2e/weekly_reveal.py
Record real data: add --record --snapshot tmp/weekly-reveal/monday-snapshot.json
Authentication/persistence are simulated here; service integration tests cover the DB.
"""
import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import expect, sync_playwright


OPENING = "2026-10-26T12:00:00.000Z"
RECAP_START = "2026-10-19T00:00:00.000Z"
RECAP_END = "2026-10-26T00:00:00.000Z"
SCENES = ["intro", "rank-3", "rank-2", "rank-1", "podium", "growth", "added", "missed", "zero", "finish"]
VIEWPORTS = {"desktop": (1440, 900), "phone": (390, 844), "narrow": (320, 568), "tablet": (768, 1024), "landscape": (844, 390)}


def sample_recap():
    podium = [
        {"athleteId": "first", "name": "Alexandra Montgomery", "totalMinutes": 420, "previousWeekMinutes": 280, "activityTypes": ["ERG", "RUN", "CYCLE", "SWIM", "OTHER"], "avgHr": 148.4, "percentChange": 50, "rank": 1},
        {"athleteId": "second", "name": "Jordan Rivera", "totalMinutes": 310, "previousWeekMinutes": 400, "activityTypes": ["ERG", "RUN"], "avgHr": None, "percentChange": -22.5, "rank": 2},
        {"athleteId": "third", "name": "Sam Chen", "totalMinutes": 240, "previousWeekMinutes": 0, "activityTypes": ["CYCLE"], "avgHr": 139, "percentChange": None, "rank": 3},
    ]
    return {"teamId": "preview-team", "teamName": "Preview team · sample data", "weekStartAt": RECAP_START, "weekEndAt": RECAP_END, "podium": podium,
            "mostImproved": {**podium[0], "athleteId": "growth", "name": "Taylor Brooks", "previousWeekMinutes": 30, "totalMinutes": 120, "percentChange": 300, "rank": 4},
            "mostAdded": podium[0], "missedTargetCount": 7, "zeroMinutesCount": 3, "athleteCount": 24}


def response(value, dates=()):
    data = {"json": value}
    if dates:
        data["meta"] = {"values": {key: ["Date"] for key in dates}, "v": 1}
    return {"result": {"data": data}}


class Server:
    """Persistent fixture state deliberately lives outside browser storage."""
    def __init__(self, recap=None, role="ATHLETE"):
        self.recap = deepcopy(recap if recap is not None else sample_recap())
        self.role, self.user_id = role, f"preview-{role.lower()}"
        self.seen, self.calls, self.unknown = set(), [], []
        self.pending_failures = self.complete_failures = 0
        self.rollover_on_complete = False

    def intercept(self, route):
        request, parsed = route.request, urlparse(route.request.url)
        names = unquote(parsed.path.split("/api/trpc/")[1]).split(",")
        query_input = parse_qs(parsed.query).get("input", ["{}"])
        raw = request.post_data_json if request.method == "POST" else json.loads(query_input[0])
        payloads = []
        for index, name in enumerate(names):
            item = (raw or {}).get(str(index), {})
            value = item.get("json") if isinstance(item, dict) else None
            self.calls.append((name, value))
            if name == "auth.getSession":
                payload = response({"user": {"id": self.user_id, "name": "Preview user", "email": "preview@example.test", "role": self.role, "status": "ACTIVE"}, "expiresAt": "2027-01-01T00:00:00.000Z"}, ["expiresAt"])
            elif name == "weeklyReveal.getPending":
                if self.pending_failures:
                    self.pending_failures -= 1
                    payload = self.error(name)
                else:
                    recap = None if self.key() in self.seen else self.recap
                    payload = response(recap, ["weekStartAt", "weekEndAt"] if recap else [])
            elif name == "weeklyReveal.complete":
                assert value == {"teamId": self.recap["teamId"], "weekStartAt": self.recap["weekStartAt"]}, value
                if self.rollover_on_complete:
                    self.rollover_on_complete = False
                    self.recap.update(weekStartAt=RECAP_END, weekEndAt="2026-11-02T01:00:00.000Z")
                    payload = self.error(name, "BAD_REQUEST")
                elif self.complete_failures:
                    self.complete_failures -= 1
                    payload = self.error(name)
                else:
                    self.seen.add(self.key())
                    payload = response({"success": True})
            elif name == "coach.listTeams":
                payload = response([{"id": self.recap["teamId"], "name": self.recap["teamName"]}])
            elif name in ("coach.listAthletes", "athlete.getHistoryWithEntries"):
                payload = response([])
            elif name == "athlete.getDashboard":
                payload = response({"weekStartAt": self.recap["weekEndAt"]}, ["weekStartAt"])
            elif name == "coach.getReviewQueue":
                payload = response({"entries": [], "nextCursor": None})
            else:
                self.unknown.append(name)
                payload = self.error(name)
            payloads.append(payload)
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payloads if "batch" in parse_qs(parsed.query) else payloads[0]))

    def key(self):
        return self.user_id, self.recap["teamId"], self.recap["weekStartAt"]

    @staticmethod
    def error(name, code="INTERNAL_SERVER_ERROR"):
        return {"error": {"json": {"message": "Deliberate preview connection failure", "code": -32600 if code == "BAD_REQUEST" else -32603, "data": {"code": code, "httpStatus": 400 if code == "BAD_REQUEST" else 500, "path": name}}}}

    def completions(self):
        return sum(name == "weeklyReveal.complete" for name, _ in self.calls)


def open_page(browser, server, args, viewport="desktop", *, clock=True, reduced=False, recording=None):
    width, height = VIEWPORTS[viewport]
    options = {"viewport": {"width": width, "height": height}, "device_scale_factor": 1, "reduced_motion": "reduce" if reduced else "no-preference"}
    if recording:
        options.update(record_video_dir=str(recording), record_video_size=options["viewport"])
    context = browser.new_context(**options)
    context.route("**/api/trpc/**", server.intercept)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    if clock:
        page.clock.install(time=datetime.fromisoformat(OPENING.replace("Z", "+00:00")))
        page.clock.pause_at("2026-10-26T12:01:00.000Z")
    route = "/athlete/history" if server.role == "ATHLETE" else f"/coach/review?teamId={server.recap['teamId']}"
    page.goto(args.base_url + route, wait_until="domcontentloaded" if recording else "networkidle")
    if recording:
        page.locator("[data-scene]").wait_for()
    if clock:
        pump(page, lambda: page.locator("[data-scene], [role='alertdialog']").count() > 0 or (
            any(name == "weeklyReveal.getPending" for name, _ in server.calls)
            and page.locator("main").count() > 0 and page.locator("[inert]").count() == 0
        ))
    assert not errors and not server.unknown, (errors, server.unknown)
    return context, page, errors


def pump(page, predicate, milliseconds=12000):
    # run_for fires every interval; fast_forward deliberately skips ticks, which
    # would not test the experience's active-viewing-time clock correctly.
    for _ in range(milliseconds // 100):
        if predicate():
            return
        page.clock.run_for(100)
    assert predicate(), "Expected UI state was not reached in virtual time"


def scene(page):
    return page.locator("[data-scene]").get_attribute("data-scene")


def settle_native_motion(page):
    # Browser-native animations use document.timeline, outside Playwright's
    # virtual timer. Finish only their finite cosmetic transitions in checks;
    # realtime recordings exercise those animations without this helper.
    for _ in range(8):
        page.locator("[data-scene]").evaluate("root => root.getAnimations({subtree:true}).filter(a => Number.isFinite(a.effect.getComputedTiming().endTime)).forEach(a => a.finish())")
        page.clock.run_for(20)


def check_layout(page, label):
    issues = page.locator("[data-scene]").evaluate("""root => {
      const out = [], width = innerWidth, height = innerHeight;
      const box = root.getBoundingClientRect();
      if (Math.abs(box.left) > 1 || Math.abs(box.top) > 1 || Math.abs(box.width-width) > 1 || Math.abs(box.height-height) > 1) out.push('not full viewport');
      if (root.scrollWidth > root.clientWidth + 1) out.push('horizontal scene overflow');
      for (const el of root.querySelectorAll('h1,h2,p,strong,button,[aria-label="Workout activities"] > span')) {
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        const b = el.getBoundingClientRect();
        if (b.left < -1 || b.right > width+1) out.push('outside viewport: ' + el.textContent);
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) out.push('clipped text: ' + el.textContent);
        const range = document.createRange(); range.selectNodeContents(el);
        for (const r of range.getClientRects()) if (r.width > 2 && (r.left < -1 || r.right > width+1)) out.push('text outside viewport: ' + el.textContent);
      }
      const section = root.querySelector('section');
      if (section) {
        const b = section.getBoundingClientRect(), header = root.querySelector('header').getBoundingClientRect(), footer = root.querySelector('footer').getBoundingClientRect();
        if (b.top < header.bottom-1) out.push('scene overlaps header');
        if (b.bottom > footer.top+1) out.push('scene overlaps footer');
      }
      return [...new Set(out)];
    }""")
    assert not issues, f"{label}: {issues}"


def walk_scenes(page, server, *, output=None, prefix="", checks=True, prior_completions=0):
    expected = ["intro"] + [f"rank-{a['rank']}" for a in reversed(server.recap["podium"])] + SCENES[4:]
    for target in expected:
        pump(page, lambda: scene(page) == target)
        settle_native_motion(page)
        pump(page, lambda: page.locator(f"#reveal-{target}").count() == 1)
        # Let exit/entrance transitions and the numeric count settle.
        page.clock.run_for(1500)
        settle_native_motion(page)
        expect(page.locator(f"#reveal-{target}")).to_be_visible()
        if checks:
            check_layout(page, f"{prefix}/{target}")
        assert server.completions() == prior_completions, "Completion sent before final user action"
        if target != "finish":
            expect(page.get_by_role("button", name="Let’s get to work", exact=True)).to_have_count(0)
        if target.startswith("rank-"):
            athlete = next(a for a in server.recap["podium"] if target == f"rank-{a['rank']}")
            expect(page.locator(f"#reveal-{target}")).to_have_text(athlete["name"])
            expect(page.get_by_label("Workout activities")).to_be_visible()
            expect(page.get_by_text("Average heart rate", exact=True)).to_be_visible()
            expect(page.get_by_text("No HR data" if athlete["avgHr"] is None else f"{round(athlete['avgHr'])} bpm", exact=True)).to_be_visible()
            change = athlete["percentChange"]
            change_text = "New this week" if change is None else f"{'+' if change > 0 else ''}{change:g}%"
            expect(page.get_by_text(change_text, exact=True)).to_be_visible()
            expect(page.locator("[data-scene] section")).to_contain_text(f"{athlete['totalMinutes']:,}")
        if target in ("growth", "added") and not server.recap["mostImproved" if target == "growth" else "mostAdded"]:
            expect(page.get_by_text("No qualifying increase this week.", exact=False)).to_be_visible()
        if target in ("missed", "zero"):
            expect(page.get_by_role("img", name="Sad face" if target == "missed" else "Skull")).to_be_visible()
            expect(page.locator("[data-scene] section")).to_contain_text(str(server.recap["missedTargetCount" if target == "missed" else "zeroMinutesCount"]))
        if output:
            page.screenshot(path=str(output / f"{prefix}-{target}.png"))
    expect(page.get_by_role("button", name="Let’s get to work", exact=True)).to_be_visible()


def finish(page, server):
    page.get_by_role("button", name="Let’s get to work", exact=True).click()
    pump(page, lambda: page.locator("[data-scene]").count() == 0)
    assert server.key() in server.seen


def verify(browser, args):
    results = []
    server = Server()
    context, page, errors = open_page(browser, server, args)
    try:
        progress = lambda: page.get_by_role("progressbar").evaluate("el => parseFloat(el.firstElementChild.style.width)")
        before = progress()
        for _ in range(12):
            page.clock.run_for(100)
        delta = progress() - before
        assert 2.9 <= delta <= 3.6, f"1.2 active seconds must advance about 3.3%, got {delta}%"
        for _ in range(335):
            page.clock.run_for(100)
        assert scene(page) != "finish", "Awards finished before 36.5 seconds of viewing"
        for _ in range(20):
            page.clock.run_for(100)
        assert scene(page) == "finish", "Awards did not finish after 36.5 seconds of viewing"
        assert server.completions() == 0 and not errors
        results.append("active-viewing clock advances 1.2 seconds accurately and completes the 36.5-second sequence")
        print("PASS", results[-1], flush=True)
    finally:
        context.close()
    for viewport in VIEWPORTS:
        server = Server()
        context, page, errors = open_page(browser, server, args, viewport)
        try:
            expect(page.locator("[data-scene]")).to_have_attribute("data-scene", "intro")
            page.keyboard.press("Escape")
            expect(page.locator("[data-scene]")).to_be_visible()
            page.get_by_role("button", name="Pause awards").click()
            progress = page.get_by_role("progressbar").get_attribute("aria-valuenow")
            page.clock.run_for(6000)
            assert page.get_by_role("progressbar").get_attribute("aria-valuenow") == progress
            page.keyboard.press("Tab")
            assert page.evaluate("document.querySelector('[data-scene]').contains(document.activeElement)"), "Focus escaped blocking awards"
            page.get_by_role("button", name="Resume awards").click()
            page.evaluate("Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))")
            page.clock.run_for(6000)
            assert page.get_by_role("progressbar").get_attribute("aria-valuenow") == progress
            page.evaluate("delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))")
            walk_scenes(page, server, output=args.output, prefix=viewport)
            finish(page, server)
            assert not errors and not server.unknown, (errors, server.unknown)
            results.append(f"{viewport}: all scenes, viewport/text bounds, focus, pause, visibility, Escape, final completion")
            print("PASS", results[-1], flush=True)
        finally:
            context.close()

    # Server completion persists across reloads and a new browser context.
    # Reuse the server that received the final real completion above.
    context, page, errors = open_page(browser, server, args)
    try:
        expect(page.get_by_role("heading", name="Weekly history")).to_be_visible()
        expect(page.locator("[data-scene]")).to_have_count(0)
        page.reload(wait_until="networkidle")
        page.clock.run_for(1000)
        expect(page.locator("[data-scene]")).to_have_count(0)
        server.recap.update(weekStartAt=RECAP_END, weekEndAt="2026-11-02T01:00:00.000Z")
        page.clock.set_system_time(datetime(2026, 11, 2, 12, tzinfo=timezone.utc))
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        pump(page, lambda: page.locator("[data-scene]").count() == 1)
        assert scene(page) == "intro"
        assert not errors and not server.unknown, (errors, server.unknown)
        results.append("server seen state across fresh context/reload; new week rechecks on focus")
    finally:
        context.close()

    server = Server()
    context, page, errors = open_page(browser, server, args)
    try:
        pump(page, lambda: scene(page) == "rank-3")
        assert server.completions() == 0 and not server.seen
        page.reload(wait_until="networkidle")
        pump(page, lambda: page.locator("[data-scene]").count() == 1)
        assert scene(page) == "intro", "Interrupted reload must restart unseen recap"
        walk_scenes(page, server, prefix="interrupted")
        finish(page, server)
        old_key = server.key()
        server.user_id = "another-athlete"
        page.reload(wait_until="networkidle")
        pump(page, lambda: page.locator("[data-scene]").count() == 1)
        assert scene(page) == "intro" and old_key in server.seen and server.key() not in server.seen
        assert not errors and not server.unknown, (errors, server.unknown)
        results.append("interrupted reload replays unseen awards; another account gets its own recap")
        print("PASS", results[-1], flush=True)
    finally:
        context.close()

    for role in ("COACH", "ADMIN"):
        server = Server(role=role)
        context, page, errors = open_page(browser, server, args, reduced=True)
        try:
            walk_scenes(page, server, prefix=role)
            assert any(name == "weeklyReveal.getPending" and value == {"teamId": server.recap["teamId"]} for name, value in server.calls)
            finish(page, server)
            if role == "COACH":
                first_key = server.key()
                server.recap.update(teamId="another-team", teamName="Another preview team")
                page.goto(args.base_url + "/coach/review?teamId=another-team", wait_until="networkidle")
                pump(page, lambda: page.locator("[data-scene]").count() == 1)
                assert scene(page) == "intro" and first_key in server.seen and server.key() not in server.seen
            assert not errors and not server.unknown, (errors, server.unknown)
            results.append(f"{role}: team-scoped first opening, full reduced-motion sequence and completion" + ("; separate team remains unseen" if role == "COACH" else ""))
            print("PASS", results[-1], flush=True)
        finally:
            context.close()

    server = Server()
    server.pending_failures, server.complete_failures = 2, 1
    context, page, errors = open_page(browser, server, args)
    try:
        pump(page, lambda: page.get_by_role("alertdialog").count() == 1)
        assert page.get_by_role("heading", name="Weekly history").evaluate("el => Boolean(el.closest('[inert]'))"), "Failed recap lookup must keep the app inert behind the blocking message"
        page.get_by_role("button", name="Try again", exact=True).click()
        pump(page, lambda: page.locator("[data-scene]").count() == 1)
        walk_scenes(page, server, prefix="retry")
        page.get_by_role("button", name="Let’s get to work", exact=True).click()
        pump(page, lambda: page.get_by_role("button", name="Try saving again").count() == 1)
        assert server.key() not in server.seen
        expect(page.get_by_role("alert")).to_contain_text("couldn't save")
        page.get_by_role("button", name="Try saving again").click()
        pump(page, lambda: page.locator("[data-scene]").count() == 0)
        assert server.completions() == 2 and server.key() in server.seen
        assert not errors and not server.unknown, (errors, server.unknown)
        results.append("failed pending request blocks app and retries; failed completion retains recap and retries")
    finally:
        context.close()

    server = Server()
    server.rollover_on_complete = True
    context, page, errors = open_page(browser, server, args)
    try:
        walk_scenes(page, server, prefix="expired")
        page.get_by_role("button", name="Let’s get to work", exact=True).click()
        pump(page, lambda: page.locator("[data-scene='intro']").count() == 1)
        assert server.completions() == 1 and not server.seen
        expect(page.get_by_text("We couldn't save your recap.", exact=False)).to_have_count(0)
        walk_scenes(page, server, prefix="rollover", prior_completions=1)
        finish(page, server)
        assert not errors and not server.unknown, (errors, server.unknown)
        results.append("BAD_REQUEST at rollover discards expired recap, loads new week, then saves successfully")
        print("PASS", results[-1], flush=True)
    finally:
        context.close()

    for count in (0, 1, 2):
        recap = sample_recap()
        recap.update(podium=recap["podium"][:count], mostImproved=None, mostAdded=None, athleteCount=count, missedTargetCount=0, zeroMinutesCount=0)
        server = Server(recap)
        context, page, errors = open_page(browser, server, args, "phone", reduced=True)
        try:
            walk_scenes(page, server, prefix=f"{count}-winners")
            finish(page, server)
            assert not errors and not server.unknown, (errors, server.unknown)
            results.append(f"{count} podium athletes, no eligible improvement awards, zero counts")
            print("PASS", results[-1], flush=True)
        finally:
            context.close()
    return results


def record(browser, args, viewport, snapshot):
    server = Server(snapshot["recap"] if snapshot else sample_recap())
    context, page, errors = open_page(browser, server, args, viewport, clock=False, recording=args.output / "raw-video")
    video = page.video
    observed = []
    try:
        for _ in range(450):
            current = scene(page)
            if not observed or current != observed[-1]:
                observed.append(current)
            assert server.completions() == 0
            if current == "finish":
                break
            page.wait_for_timeout(200)
        assert observed[-1] == "finish", "Awards did not finish within 90 seconds"
        page.wait_for_timeout(1500)
        check_layout(page, f"video-{viewport}/finish")
        page.screenshot(path=str(args.output / f"monday-{viewport}.png"))
        assert observed == SCENES, observed
        assert not errors and not server.unknown, (errors, server.unknown)
    finally:
        context.close()
    raw = Path(video.path())
    caption = args.output / f"{viewport}-caption.txt"
    source = f"Real snapshot: {snapshot['capturedAt']}" if snapshot else "Synthetic sample data"
    caption.write_text(f"MONDAY OCT 26 PREVIEW\n{source}")
    output = args.output / f"monday-{viewport}.mp4"
    # shortcut: captions use macOS Arial; choose an installed font on other runners.
    font = "/System/Library/Fonts/Supplemental/Arial.ttf"
    size = 13 if viewport == "phone" else 20
    filters = f"pad=iw:ih+64:0:0:black,drawtext=fontfile='{font}':textfile='{caption.resolve()}':fontcolor=white:fontsize={size}:x=12:y=h-54:line_spacing=5"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vf", filters, "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)], check=True)
    return {"viewport": viewport, "video": str(output), "observedScenes": observed, "source": source}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("E2E_BASE_URL", "http://localhost:3100"))
    parser.add_argument("--output", type=Path, default=Path("tmp/weekly-reveal"))
    parser.add_argument("--snapshot", type=Path)
    parser.add_argument("--record", action="store_true")
    parser.add_argument("--record-only", action="store_true")
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ("localhost", "127.0.0.1", "::1"), "Use a local app server"
    args.output.mkdir(parents=True, exist_ok=True)
    snapshot = json.loads(args.snapshot.read_text()) if args.snapshot else None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            results = [] if args.record_only else verify(browser, args)
            videos = [record(browser, args, viewport, snapshot) for viewport in ("desktop", "phone")] if args.record or args.record_only else []
        finally:
            browser.close()
    report = {"baseUrl": args.base_url, "checks": results, "videos": videos, "limitations": "Browser APIs and persistence mocked; visibility event simulated. Functional checks advance virtual timers and settle native transitions. Database/auth checks belong to integration tests. Videos run at real speed without clock overrides."}
    (args.output / "browser-results.json").write_text(json.dumps(report, indent=2))
    if results:
        (args.output / "browser-checks.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
