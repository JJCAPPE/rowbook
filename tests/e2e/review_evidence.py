"""Review gallery regression checks; all application APIs and proof images are mocked.

Run against local Next: E2E_BASE_URL=http://localhost:3100 python tests/e2e/review_evidence.py
"""
import json
import os
from pathlib import Path
import unittest
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:3100")
OUTPUT = ROOT / "tmp" / "review-evidence"
PHOTO_NAMES = ("garmin.PNG", "strava.PNG")
WEEK_START = "2026-11-09T01:00:00.000Z"
WEEK_END = "2026-11-16T01:00:00.000Z"


def response(value, dates=()):
    data = {"json": value}
    if dates:
        data["meta"] = {"values": {key: ["Date"] for key in dates}, "v": 1}
    return {"result": {"data": data}}


def entry(index=0, proof_count=2):
    return {
        "id": f"review-{index}", "version": 3, "athleteName": f"Review fixture {index + 1}",
        "activityType": "ERG", "minutes": 42, "distance": 10, "avgHr": 150,
        "avgPace": 126, "avgWatts": 175, "notes": None,
        "date": "2026-11-12T17:00:00.000Z", "validationStatus": "PENDING",
        "rejectionNote": None, "reviewedAt": None, "proofExtractionStatus": "COMPLETED",
        "extractionFailureCode": None,
        "extractedFields": {"activityType": "ERG", "date": "2026-11-12",
                            "minutes": 42, "distance": 10, "avgHr": 150},
        "proofs": [{"id": f"proof-{index}-{n}", "fileName": PHOTO_NAMES[n % len(PHOTO_NAMES)],
                    "validationStatus": "PENDING", "available": True} for n in range(proof_count)],
    }


class ReviewServer:
    def __init__(self, entries=None, role="COACH"):
        self.entries = entries if entries is not None else [entry()]
        self.role = role
        self.calls, self.unknown, self.image_requests = [], [], []
        self.evidence_attempts = {}
        self.hold_evidence = self.hold_images = self.fail_images = False
        self.evidence_failures = 0
        self.pending_evidence, self.pending_images = [], []

    def intercept(self, route):
        request, parsed = route.request, urlparse(route.request.url)
        names = unquote(parsed.path.split("/api/trpc/")[1]).split(",")
        raw = request.post_data_json if request.method == "POST" else json.loads(
            parse_qs(parsed.query).get("input", ["{}"])[0])
        payloads = []
        for index, name in enumerate(names):
            value = (raw or {}).get(str(index), {}).get("json")
            self.calls.append((name, value))
            if name == "auth.getSession":
                payload = response({"user": {"id": "review-coach", "name": "Review coach",
                                    "email": "review@example.test", "role": self.role, "status": "ACTIVE"},
                                    "expiresAt": "2027-01-01T00:00:00.000Z"}, ["expiresAt"])
            elif name == "weeklyReveal.getPending":
                payload = response(None)
            elif name == "coach.listTeams":
                payload = response([{"id": "review-team", "name": "Review fixture team"}])
            elif name == "coach.listAthletes":
                payload = response([])
            elif name == "coach.getReviewQueue":
                payload = response({"entries": self.entries, "nextCursor": None},
                                   [f"entries.{n}.date" for n in range(len(self.entries))])
            elif name in ("athlete.getDashboard", "athlete.getWeekDetail"):
                payload = response({"weekStartAt": WEEK_START, "weekEndAt": WEEK_END,
                                    "totalMinutes": 42, "totalDistanceKm": 10, "sessions": len(self.entries),
                                    "requiredMinutes": 120, "avgHr": 150, "entries": self.entries},
                                   ["weekStartAt", "weekEndAt", *[f"entries.{n}.date" for n in range(len(self.entries))]])
            elif name == "athlete.getHistory":
                payload = response([])
            elif name == "athlete.getHistoryWithEntries":
                payload = response([{"weekStartAt": WEEK_START, "weekEndAt": WEEK_END,
                                     "totalMinutes": 42, "requiredMinutes": 120, "status": "NOT_MET",
                                     "hasHrData": True, "activityTypes": ["ERG"], "entries": self.entries}],
                                   ["0.weekStartAt", "0.weekEndAt", *[f"0.entries.{n}.date" for n in range(len(self.entries))]])
            elif name == "coach.getAthleteDetail":
                payload = response({"athlete": {"id": "evidence-athlete", "name": "Evidence athlete"},
                                    "history": [], "activityMix": [], "entries": self.entries},
                                   [f"entries.{n}.date" for n in range(len(self.entries))])
            elif name in ("coach.getReviewEvidence", "athlete.getEntryEvidence"):
                assert value["expectedVersion"] == 3, value
                item = next(item for item in self.entries if item["id"] == value["entryId"])
                attempt = self.evidence_attempts.get(item["id"], 0) + 1
                self.evidence_attempts[item["id"]] = attempt
                if self.evidence_failures:
                    self.evidence_failures -= 1
                    payload = {"error": {"json": {"message": "Deliberate evidence failure", "code": -32603,
                               "data": {"code": "INTERNAL_SERVER_ERROR", "httpStatus": 500, "path": name}}}}
                else:
                    payload = response({"entryId": item["id"], "version": 3, "images": [
                        {"id": proof["id"], "alt": f"Workout proof {n + 1}",
                         "src": f"http://proofs.example.test/{item['id']}/{proof['fileName']}?v={attempt}"}
                        for n, proof in enumerate(item["proofs"])]})
            else:
                self.unknown.append(name)
                payload = response(None)
            payloads.append(payload)
        body = json.dumps(payloads if "batch" in parse_qs(parsed.query) else payloads[0])
        if self.hold_evidence and any(name in names for name in ("coach.getReviewEvidence", "athlete.getEntryEvidence")):
            self.pending_evidence.append((route, body))
        else:
            route.fulfill(status=200, content_type="application/json", body=body)

    def image(self, route):
        self.image_requests.append(route.request.url)
        if self.hold_images:
            self.pending_images.append(route)
        elif self.fail_images:
            route.fulfill(status=403, body="Expired fixture URL")
        else:
            self.fulfill_image(route)

    @staticmethod
    def fulfill_image(route):
        name = Path(urlparse(route.request.url).path).name
        assert name in PHOTO_NAMES, name
        route.fulfill(status=200, content_type="image/png",
                      path=str(ROOT / "tests" / "test-photos" / name))

    def release_evidence(self):
        self.hold_evidence = False
        for route, body in self.pending_evidence:
            route.fulfill(status=200, content_type="application/json", body=body)
        self.pending_evidence.clear()

    def release_images(self):
        self.hold_images = False
        for route in self.pending_images:
            self.fulfill_image(route)
        self.pending_images.clear()


class ReviewEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            headless=True, **({"channel": os.environ["E2E_BROWSER_CHANNEL"]}
                             if "E2E_BROWSER_CHANNEL" in os.environ else {}))
        OUTPUT.mkdir(parents=True, exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def open_review(self, server=None, width=1440, height=900,
                    path="/coach/review?teamId=review-team", title="Review workouts"):
        server = server or ReviewServer()
        context = self.browser.new_context(viewport={"width": width, "height": height},
                                           reduced_motion="reduce")
        self.addCleanup(context.close)
        context.route("**/api/trpc/**", server.intercept)
        context.route("http://proofs.example.test/**", server.image)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        self.addCleanup(lambda: self.assertEqual(errors + server.unknown, []))
        page.clock.install(time="2026-11-12T19:00:00.000Z")
        page.goto(BASE_URL + path, wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible(timeout=15000)
        if path.startswith("/coach/review"):
            expect(page.locator("article").first.get_by_role("heading")).to_be_visible()
        return page, server

    def loaded_image(self, scope):
        image = scope.locator("[data-proof-image]")
        expect(image).to_be_visible()
        expect(image).to_have_js_property("complete", True)
        self.assertGreater(image.evaluate("image => image.naturalWidth"), 0)
        return image

    def check_thumbnail_rail(self, scope, image_selector="[data-proof-image]"):
        rail = scope.locator("[data-proof-thumbnails]")
        image = scope.locator(image_selector)
        expect(rail).to_be_visible()
        self.assertLessEqual(rail.bounding_box()["x"] + rail.bounding_box()["width"], image.bounding_box()["x"])
        first, second = rail.get_by_role("button").nth(0).bounding_box(), rail.get_by_role("button").nth(1).bounding_box()
        self.assertAlmostEqual(first["x"], second["x"], delta=1)
        self.assertGreaterEqual(second["y"], first["y"] + first["height"])

    def test_details_stay_usable_while_evidence_and_images_load(self):
        server = ReviewServer()
        server.hold_evidence = server.hold_images = True
        page, _ = self.open_review(server)
        article = page.locator("article").first
        expect(article.get_by_role("status", name="Loading Rowbook")).to_be_visible()
        for _ in range(200):
            if server.pending_evidence:
                break
            page.wait_for_timeout(50)
        self.assertTrue(server.pending_evidence, "Evidence must request itself without a Load click")
        expect(article.get_by_role("button", name="Approve", exact=True)).to_be_enabled()
        article.get_by_role("button", name="Reject", exact=True).click()
        expect(article.get_by_label("Why is this workout being rejected?")).to_be_visible()
        article.get_by_role("button", name="Cancel", exact=True).click()
        server.release_evidence()
        expect(article.get_by_role("status", name="Loading Rowbook")).to_be_visible()
        expect(article.get_by_role("button", name="View proof image 2", exact=True)).to_be_visible()
        self.assertEqual({Path(urlparse(url).path).name for url in server.image_requests}, set(PHOTO_NAMES))
        expect(article.get_by_role("button", name="Approve", exact=True)).to_be_enabled()
        server.release_images()
        self.loaded_image(article)
        expect(article.get_by_role("status", name="Loading Rowbook")).to_have_count(0)

    def test_thumbnail_selection_enlargement_and_keyboard(self):
        page, server = self.open_review()
        article = page.locator("article").first
        self.loaded_image(article)
        self.check_thumbnail_rail(article)
        second = article.get_by_role("button", name="View proof image 2", exact=True)
        second.focus()
        page.keyboard.press("Enter")
        expect(second).to_have_attribute("aria-pressed", "true")
        self.assertIn("strava.PNG", self.loaded_image(article).get_attribute("src"))
        zoom = article.get_by_role("button", name="Zoom proof image", exact=True)
        expect(zoom.locator("[data-proof-image]")).to_be_visible()
        zoom.focus()
        page.keyboard.press("Enter")
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("button", name="Close", exact=True)).to_be_focused()
        expect(dialog.get_by_role("heading")).to_have_text("Proof image 2 of 2")
        self.check_thumbnail_rail(dialog, "[data-proof-modal-image]")
        dialog.get_by_role("button", name="View proof image 1", exact=True).click()
        expect(dialog.get_by_role("heading")).to_have_text("Proof image 1 of 2")
        dialog.get_by_role("button", name="View proof image 2", exact=True).click()
        expect(dialog.get_by_role("img")).to_have_attribute("src", article.locator("[data-proof-image]").get_attribute("src"))
        dialog.get_by_role("button", name="Zoom in", exact=True).click()
        expect(dialog.get_by_text("125%", exact=True)).to_be_visible()
        dialog.get_by_role("button", name="Rotate proof image clockwise", exact=True).click()
        self.assertEqual(dialog.get_by_role("img").evaluate("image => image.style.transform"),
                         "rotate(90deg) scale(1.25)")
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(zoom).to_be_focused()
        expect(second).to_have_attribute("aria-pressed", "true")
        zoom.click()
        dialog.get_by_role("button", name="Close", exact=True).focus()
        page.keyboard.press("ArrowLeft")
        expect(dialog.get_by_role("heading")).to_have_text("Proof image 1 of 2")
        page.keyboard.press("ArrowRight")
        expect(dialog.get_by_role("heading")).to_have_text("Proof image 2 of 2")
        page.mouse.click(1, 1)
        expect(dialog).to_have_count(0)
        expect(zoom).to_be_focused()
        title_box = article.get_by_role("heading").bounding_box()
        image_box = article.locator("[data-proof-gallery]").bounding_box()
        self.assertGreater(image_box["x"], title_box["x"] + title_box["width"])
        page.evaluate("window.scrollTo({top: 0, behavior: 'instant'}); document.activeElement.blur()")
        page.mouse.move(page.viewport_size["width"] - 4, 4)
        page.screenshot(path=str(OUTPUT / "desktop.png"), full_page=True, animations="disabled")

    def test_image_failure_refreshes_signed_urls(self):
        server = ReviewServer()
        server.fail_images = True
        page, _ = self.open_review(server)
        article = page.locator("article").first
        expect(article.get_by_text("Proof image unavailable", exact=True)).to_be_visible()
        server.fail_images = False
        article.get_by_role("button", name="Try again", exact=True).click()
        expect(article.get_by_text("Proof image unavailable", exact=True)).to_have_count(0)
        expect(self.loaded_image(article)).to_have_attribute("src", "http://proofs.example.test/review-0/garmin.PNG?v=2")
        self.assertEqual(server.evidence_attempts["review-0"], 2)

    def test_compact_comparison_keeps_values_and_statuses(self):
        page, _ = self.open_review()
        article = page.locator("article").first
        comparison = article.get_by_role("region", name="Entered and photo values")
        expect(comparison.get_by_text("42 min", exact=True)).to_have_count(2)
        statuses = comparison.get_by_text("Matches", exact=True)
        expect(statuses).to_have_count(5)
        expect(article.get_by_text("Pending Review", exact=True)).to_have_count(0)
        expect(article.get_by_text("Review gallery regression fixture", exact=True)).to_have_count(0)
        expect(comparison.get_by_text("Minutes can be lower than the photo.", exact=False)).to_have_count(0)
        expect(comparison.get_by_text("The photo supports up to", exact=False)).to_have_count(0)
        expect(article.get_by_role("button", name="Enlarge proof image", exact=True)).to_have_count(0)
        self.assertTrue(statuses.evaluate_all("""statuses => statuses.every(status => {
            const value = status.previousElementSibling.getBoundingClientRect();
            const label = status.getBoundingClientRect();
            return label.x >= value.right - 1 && Math.abs((label.y + label.height / 2) - (value.y + value.height / 2)) < 2;
        })"""))

    def test_evidence_failure_can_retry(self):
        server = ReviewServer()
        server.evidence_failures = 1
        page, _ = self.open_review(server)
        article = page.locator("article").first
        expect(article.get_by_text("Evidence could not be loaded.", exact=True)).to_be_visible()
        article.get_by_role("button", name="Try again", exact=True).click()
        self.loaded_image(article)
        self.assertEqual(server.evidence_attempts["review-0"], 2)

    def test_image_refresh_failure_can_retry_evidence(self):
        server = ReviewServer()
        server.fail_images = True
        page, _ = self.open_review(server)
        article = page.locator("article").first
        expect(article.get_by_text("Proof image unavailable", exact=True)).to_be_visible()
        server.fail_images, server.evidence_failures = False, 1
        article.get_by_role("button", name="Try again", exact=True).click()
        expect(article.get_by_text("Evidence could not be loaded.", exact=True)).to_be_visible()
        article.get_by_role("button", name="Try again", exact=True).click()
        self.loaded_image(article)
        self.assertEqual(server.evidence_attempts["review-0"], 3)

    def test_single_and_expired_proofs(self):
        page, server = self.open_review(ReviewServer([entry(0, 1), entry(1, 0)]))
        article = page.locator("article").first
        self.loaded_image(article)
        expect(article.get_by_role("button", name="View proof image 2", exact=True)).to_have_count(0)
        expect(page.locator("article").nth(1).get_by_text("Evidence has expired.", exact=True)).to_be_visible()
        self.assertNotIn("review-1", server.evidence_attempts)

    def test_six_proofs_stay_selectable_without_growing_the_rail(self):
        for width in (1440, 320):
            with self.subTest(width=width):
                page, _ = self.open_review(ReviewServer([entry(0, 6)]), width=width)
                article = page.locator("article").first
                self.loaded_image(article)
                gallery = article.locator("[data-proof-gallery]")
                height = gallery.bounding_box()["height"]
                rail = gallery.get_by_role("group", name="Proof images")
                self.assertEqual(rail.get_by_role("button").count(), 6)
                last = rail.get_by_role("button", name="View proof image 6", exact=True)
                last.click()
                expect(last).to_have_attribute("aria-pressed", "true")
                self.assertAlmostEqual(gallery.bounding_box()["height"], height, delta=1)
                gallery.get_by_role("button", name="Zoom proof image", exact=True).click()
                dialog = page.get_by_role("dialog")
                expect(dialog.get_by_role("heading")).to_have_text("Proof image 6 of 6")
                expect(dialog.get_by_role("button", name="View proof image 6", exact=True)).to_have_attribute("aria-pressed", "true")

    def test_distant_workouts_preload_when_scrolled_nearby(self):
        page, server = self.open_review(ReviewServer([entry(n) for n in range(12)]))
        self.loaded_image(page.locator("article").first)
        self.assertNotIn("review-11", server.evidence_attempts)
        last = page.locator("article").last
        last.scroll_into_view_if_needed()
        self.loaded_image(last)
        self.assertIn("review-11", server.evidence_attempts)

    def test_entry_evidence_opens_inline_on_athlete_and_coach_views(self):
        views = (
            ("athlete-dashboard", "ATHLETE", "/athlete", "Dashboard"),
            ("athlete-history", "ATHLETE", "/athlete/history", "Weekly history"),
            ("athlete-week", "ATHLETE", "/athlete/week/2026-11-09", "Week detail"),
            ("coach-athlete", "COACH", "/coach/athlete/evidence-athlete?teamId=review-team", "Evidence athlete"),
        )
        for label, role, path, title in views:
            for width in (1440, 320):
                with self.subTest(view=label, width=width):
                    item = {**entry(), "validationStatus": "VERIFIED", "creditPolicyVersion": 2}
                    server = ReviewServer([item], role=role)
                    server.hold_evidence = True
                    page, _ = self.open_review(server, width=width, path=path, title=title)
                    summary = page.locator("summary").filter(has_text="View evidence")
                    expect(summary).to_have_count(1)
                    self.assertEqual(server.evidence_attempts, {})
                    summary.focus()
                    page.keyboard.press("Enter")
                    evidence = summary.locator("..")
                    expect(evidence.get_by_role("status", name="Loading Rowbook")).to_be_visible()
                    expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()
                    expect(page.locator("[inert]")).to_have_count(0)
                    for _ in range(200):
                        if server.pending_evidence:
                            break
                        page.wait_for_timeout(50)
                    self.assertTrue(server.pending_evidence)
                    server.release_evidence()
                    self.loaded_image(evidence)
                    self.check_thumbnail_rail(evidence)
                    comparison = evidence.get_by_role("region", name="Entered and photo values")
                    expect(comparison.get_by_text("Matches", exact=True)).to_have_count(5)
                    expect(comparison.get_by_text("The photo supports up to", exact=False)).to_have_count(0)
                    gallery = evidence.locator("[data-proof-gallery]")
                    comparison_box, gallery_box = comparison.bounding_box(), gallery.bounding_box()
                    if width == 1440:
                        self.assertGreaterEqual(gallery_box["x"], comparison_box["x"] + comparison_box["width"])
                    else:
                        self.assertGreaterEqual(gallery_box["y"], comparison_box["y"] + comparison_box["height"])
                    self.assertTrue(evidence.evaluate("element => element.scrollWidth <= element.clientWidth + 1"))
                    self.assertTrue(gallery.evaluate("element => element.scrollWidth <= element.clientWidth + 1"))
                    evidence.get_by_role("button", name="View proof image 2", exact=True).click()
                    zoom = evidence.get_by_role("button", name="Zoom proof image", exact=True)
                    zoom.click()
                    dialog = page.get_by_role("dialog")
                    expect(dialog.get_by_role("heading")).to_have_text("Proof image 2 of 2")
                    self.check_thumbnail_rail(dialog, "[data-proof-modal-image]")
                    page.keyboard.press("Escape")
                    expect(dialog).to_have_count(0)
                    expect(zoom).to_be_focused()
                    summary.click()
                    summary.click()
                    self.loaded_image(evidence)
                    self.assertEqual(server.evidence_attempts["review-0"], 1)
                    page.evaluate("document.activeElement.blur()")
                    page.mouse.move(page.viewport_size["width"] - 4, 4)
                    evidence.screenshot(path=str(OUTPUT / f"{label}-{width}.png"), animations="disabled")

    def test_mobile_gallery_stacks_without_horizontal_overflow(self):
        for width, height in ((768, 1024), (390, 844), (320, 568)):
            with self.subTest(width=width):
                page, _ = self.open_review(width=width, height=height)
                article = page.locator("article").first
                self.loaded_image(article)
                self.check_thumbnail_rail(article)
                gallery = article.locator("[data-proof-gallery]")
                self.assertGreater(gallery.bounding_box()["y"], article.get_by_role("heading").bounding_box()["y"])
                self.assertTrue(gallery.evaluate("element => element.scrollWidth <= element.clientWidth + 1"))
                self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
                comparison = article.get_by_role("region", name="Entered and photo values")
                self.assertTrue(comparison.get_by_text("Matches", exact=True).evaluate_all("""statuses => statuses.every(status => {
                    const cell = status.parentElement.getBoundingClientRect();
                    return Array.from(status.parentElement.children).every(child => {
                        const range = document.createRange();
                        range.selectNodeContents(child);
                        return Array.from(range.getClientRects()).every(rect => rect.left >= cell.left - 1 && rect.right <= cell.right + 1);
                    });
                })"""))
                second = article.get_by_role("button", name="View proof image 2", exact=True)
                second.click()
                expect(second).to_have_attribute("aria-pressed", "true")
                page.evaluate("window.scrollTo({top: 0, behavior: 'instant'}); document.activeElement.blur()")
                page.mouse.move(page.viewport_size["width"] - 4, 4)
                page.screenshot(path=str(OUTPUT / f"width-{width}.png"), full_page=True, animations="disabled")
                article.get_by_role("button", name="Zoom proof image", exact=True).click()
                dialog = page.get_by_role("dialog")
                expect(dialog.get_by_role("button", name="Close", exact=True)).to_be_in_viewport()
                self.assertTrue(dialog.evaluate("element => element.scrollWidth <= element.clientWidth"))
                self.check_thumbnail_rail(dialog, "[data-proof-modal-image]")
                page.screenshot(path=str(OUTPUT / f"modal-{width}.png"))


if __name__ == "__main__":
    unittest.main()
