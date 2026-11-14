"""Shared proof-dialog checks using intercepted APIs and local image fixtures.

E2E_BASE_URL=http://localhost:3100 E2E_BROWSER=webkit python tests/e2e/proof_dialog.py
"""
import os
from pathlib import Path
import unittest
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

from loading import LoadingServer, WEEK_START, response


ROOT = Path(__file__).resolve().parents[2]
BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:3100")
PHOTOS = ("garmin.PNG", "strava.PNG")


class ProofServer(LoadingServer):
    def fulfill(self, item):
        route, names, payload = item
        results = payload if isinstance(payload, list) else [payload]
        for index, name in enumerate(names):
            if name == "athlete.getWeekDetail":
                data = results[index]["result"]["data"]["json"]
                entry = data["entries"][0]
                data["entries"] = [
                    {**entry, "id": f"entry-{n}", "proofs": [
                        {"id": f"proof-{n}-{photo}", "available": True} for photo in PHOTOS
                    ]} for n in range(4)
                ]
                results[index] = response(data, ["weekStartAt", "weekEndAt"] + [
                    f"entries.{n}.date" for n in range(4)
                ])
            elif name == "athlete.getEntryEvidence":
                results[index] = response({"entryId": "entry-0", "version": 1, "images": [
                    {"id": photo, "src": f"http://proofs.example.test/{photo}",
                     "alt": f"Workout proof {n + 1}"} for n, photo in enumerate(PHOTOS)
                ]})
        super().fulfill((route, names, results if isinstance(payload, list) else results[0]))


class ProofDialogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = getattr(cls.playwright, os.environ.get("E2E_BROWSER", "chromium")).launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def open_dialog(self, width=1440, height=900, fail_images=False):
        context = self.browser.new_context(viewport={"width": width, "height": height},
                                           reduced_motion="reduce")
        self.addCleanup(context.close)
        server = ProofServer()
        context.route("**/api/trpc/**", server.intercept)

        def image(route):
            if fail_images:
                route.fulfill(status=403, body="Expired fixture URL")
            else:
                photo = Path(urlparse(route.request.url).path).name
                self.assertIn(photo, PHOTOS)
                route.fulfill(status=200, content_type="image/png",
                              path=str(ROOT / "tests" / "test-photos" / photo))

        context.route("http://proofs.example.test/**", image)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        self.addCleanup(lambda: self.assertEqual(errors, []))
        page.goto(BASE_URL + f"/athlete/week/{WEEK_START[:10]}", wait_until="domcontentloaded")
        page.get_by_role("button", name="Load 2 evidence images", exact=True).first.click()
        opener = page.get_by_role("button", name="View proofs (2)", exact=True)
        opener.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        self.assertTrue(dialog.evaluate("el => el.matches(':modal')"))
        expect(dialog.get_by_role("button", name="Close", exact=True)).to_be_focused()
        return page, dialog, opener, server

    def test_keyboard_gallery_and_focus_return(self):
        page, dialog, opener, _ = self.open_dialog()
        expect(dialog).to_have_accessible_name("Proof image 1 of 2")
        page.keyboard.press("ArrowRight")
        expect(dialog).to_have_accessible_name("Proof image 2 of 2")
        page.keyboard.press("ArrowLeft")
        expect(dialog).to_have_accessible_name("Proof image 1 of 2")
        dialog.get_by_role("button", name="Zoom in", exact=True).click()
        expect(dialog.get_by_text("125%", exact=True)).to_be_visible()
        dialog.get_by_role("button", name="Rotate proof image clockwise").click()
        self.assertIn("rotate(90deg)", dialog.get_by_role("img").get_attribute("style"))
        for _ in range(14):
            page.keyboard.press("Tab")
            self.assertTrue(page.evaluate("document.activeElement === document.body || !!document.activeElement.closest('dialog')"))
        dialog.get_by_role("button", name="Close", exact=True).focus()
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        expect(opener).to_be_focused()

    def test_background_scroll_lock_and_restore(self):
        page, dialog, opener, _ = self.open_dialog(width=390, height=740)
        position = page.evaluate("scrollY")
        page.mouse.move(2, 300)
        page.mouse.wheel(0, 600)
        page.wait_for_timeout(200)
        self.assertEqual(page.evaluate("scrollY"), position)
        dialog.get_by_role("button", name="Close", exact=True).click()
        expect(opener).to_be_focused()
        page.mouse.move(200, 300)
        page.mouse.wheel(0, 600)
        page.wait_for_function("initial => scrollY > initial", arg=position)

    def test_narrow_layout_and_light_dismissal(self):
        for width in (320, 390, 768):
            with self.subTest(width=width):
                page, dialog, opener, _ = self.open_dialog(width=width, height=740)
                self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"), width)
                bounds = dialog.bounding_box()
                self.assertGreaterEqual(bounds["x"], 0)
                self.assertLessEqual(bounds["x"] + bounds["width"], width)
                page.mouse.click(1, 1)
                expect(dialog).to_have_count(0)
                expect(opener).to_be_focused()

    def test_image_failure_retry_keeps_dialog_open(self):
        page, dialog, _, server = self.open_dialog(fail_images=True)
        expect(dialog.get_by_text("Proof image unavailable", exact=True)).to_be_visible()
        server.hold = {"athlete.getEntryEvidence"}
        dialog.get_by_role("button", name="Try again", exact=True).click()
        expect(dialog.get_by_role("status", name="Loading Rowbook")).to_be_visible()
        server.release("athlete.getEntryEvidence")
        expect(dialog.get_by_text("Proof image unavailable", exact=True)).to_be_visible()
        self.assertTrue(dialog.evaluate("el => el.matches(':modal')"))
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
