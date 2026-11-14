"""Modern web UX checks against local Next, with intercepted APIs and no live writes."""
import os
import re
from pathlib import Path
import unittest

from playwright.sync_api import expect, sync_playwright

from loading import LoadingServer, response


BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:3100")
OUTPUT = Path(__file__).resolve().parents[2] / "tmp" / "modern-web"


class UXServer(LoadingServer):
    def fulfill(self, item):
        route, names, payload = item
        results = payload if isinstance(payload, list) else [payload]
        for index, name in enumerate(names):
            if name == "auth.getSession" and self.role is None:
                results[index] = response(None)
            if name not in ("athlete.getLeaderboard", "coach.getTeamOverview"):
                continue
            data = results[index]["result"]["data"]["json"]
            data["leaderboard"] = [
                {"id": "ux-athlete", "name": "Sample athlete with a long name",
                 "totalMinutes": 150, "status": "MET", "activityTypes": ["ERG"],
                 "hasHr": True, "totalDistance": 20, "avgHr": 145,
                 "previousWeekMinutes": 120, "pendingProof": False,
                 "missingMinutes": False},
            ]
            data["teamStats"] = {"totalMinutes": 150, "totalDistance": 20, "avgHr": 145}
            data["teamTrend"] = [
                {"weekStartAt": "2026-11-02T01:00:00.000Z", "minutes": 150,
                 "distance": 20, "avgHr": None},
            ]
            results[index] = response(data, ["teamTrend.0.weekStartAt"])
        super().fulfill((route, names, results if isinstance(payload, list) else results[0]))


class ModernWebTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)
        OUTPUT.mkdir(parents=True, exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def open_page(self, path="/athlete/leaderboard", width=1440, role="ATHLETE"):
        context = self.browser.new_context(
            viewport={"width": width, "height": 900 if width > 500 else 740},
            is_mobile=width < 500, has_touch=width < 500, reduced_motion="reduce",
        )
        self.addCleanup(context.close)
        server = UXServer(None if path == "/login" else role)
        context.route("**/api/trpc/**", server.intercept)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        self.addCleanup(lambda: self.assertEqual(errors, []))
        page.goto(BASE_URL + path, wait_until="domcontentloaded")
        expect(page.locator("main h1")).to_be_visible(timeout=20000)
        expect(page.get_by_role("status", name="Loading Rowbook")).to_have_count(0)
        return page

    def assert_fits(self, page):
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth"),
                             page.evaluate("document.documentElement.clientWidth"))

    def test_keyboard_skip_menu_and_week_navigation(self):
        page = self.open_page()
        expect(page).to_have_title("Weekly leaderboard | Rowbook")
        for chip in page.locator("button.touch-target[aria-pressed]").all():
            self.assertEqual(chip.bounding_box()["height"], 32)
        page.keyboard.press("Alt+Tab" if self.browser.browser_type.name == "webkit" else "Tab")
        expect(page.get_by_role("link", name="Skip to content")).to_be_focused()
        page.keyboard.press("Enter")
        expect(page.locator("#main-content")).to_be_focused()
        self.assertNotEqual(page.locator("#main-content").evaluate(
            "element => getComputedStyle(element).outlineStyle"), "none")
        page.get_by_role("button", name="Open user menu").click()
        expect(page.get_by_role("menuitem", name="Log out", exact=True)).to_be_focused()
        page.keyboard.press("Escape")
        expect(page.get_by_role("button", name="Open user menu")).to_be_focused()
        week = page.get_by_role("combobox", name="Week", exact=True)
        previous = week.locator("option").nth(1).get_attribute("value")
        week.select_option(previous)
        expect(page).to_have_url(re.compile("weekStartAt="))
        expect(week).to_have_value(previous)
        page.screenshot(path=str(OUTPUT / "athlete-desktop.png"), full_page=True)

    def test_mobile_layout_touch_targets_and_enlarged_text(self):
        for role, path in [("ATHLETE", "/athlete/leaderboard"), ("COACH", "/coach")]:
            with self.subTest(role=role):
                page = self.open_page(path, width=320, role=role)
                self.assert_fits(page)
                nav = page.locator("nav[aria-label='Primary navigation']:visible")
                expect(nav.locator("[aria-current='page']")).to_have_count(1)
                for link in nav.get_by_role("link").all():
                    box = link.bounding_box()
                    self.assertGreaterEqual(box["width"], 44)
                    self.assertGreaterEqual(box["height"], 44)
                for control in page.locator(".touch-target:visible, select:visible").all():
                    self.assertGreaterEqual(control.bounding_box()["height"], 44)
                for control in page.locator("select:visible").all():
                    self.assertGreaterEqual(control.evaluate("el => parseFloat(getComputedStyle(el).fontSize)"), 16)
                page.screenshot(path=str(OUTPUT / f"{role.lower()}-320.png"), full_page=True)
                page.evaluate("document.documentElement.style.fontSize = '200%'")
                self.assert_fits(page)
                week = page.get_by_role("combobox", name="Week", exact=True)
                selected = week.select_option(index=1)
                expect(week).to_have_value(selected[0])
                week.focus()
                expect(week).to_be_focused()
                for link in nav.get_by_role("link").all():
                    self.assertTrue(link.evaluate("el => el.scrollWidth <= el.clientWidth"))
                for chip in page.locator("button.touch-target[aria-pressed]").all():
                    self.assertTrue(chip.evaluate("el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight"))
                page.screenshot(path=str(OUTPUT / f"{role.lower()}-320-text-200.png"), full_page=True)

    def test_filter_feedback_and_keyboard_chart_data(self):
        page = self.open_page(width=390)
        expect(page.get_by_role("list", name="Athlete rankings").get_by_role("listitem")).to_have_count(1)
        pending = page.get_by_role("button", name="Pending review", exact=True)
        expect(pending).to_have_attribute("aria-pressed", "false")
        pending.click()
        expect(pending).to_have_attribute("aria-pressed", "true")
        expect(page.get_by_role("status")).to_contain_text("No athletes match these filters")
        pending.click()
        expect(page.get_by_role("status")).to_contain_text("1 of 1 athletes shown")
        summary = page.locator("summary").filter(has_text="View weekly data")
        summary.focus()
        page.keyboard.press("Enter")
        region = page.get_by_role("region", name="Weekly training data")
        expect(region).to_be_visible()
        expect(region.get_by_role("columnheader", name="Team minutes", exact=True)).to_be_visible()
        expect(region.get_by_role("cell", name="No HR data", exact=True)).to_have_count(1)
        page.keyboard.press("Tab")
        expect(region).to_be_focused()
        self.assertGreater(region.evaluate("el => el.scrollWidth"), region.evaluate("el => el.clientWidth"))
        page.keyboard.press("ArrowRight", delay=100)
        page.wait_for_function("element => element.scrollLeft > 0", arg=region.element_handle())
        expect(region.get_by_role("cell", name="150", exact=True)).to_be_visible()
        self.assert_fits(page)

    def test_coach_tables_are_named_and_keyboard_reachable(self):
        page = self.open_page("/coach/settings", width=390, role="COACH")
        expect(page).to_have_title("Weekly settings | Rowbook")
        for name in ("Weekly training targets", "Athlete training targets"):
            region = page.get_by_role("region", name=name, exact=True)
            expect(region).to_be_visible()
            region.focus()
            expect(region).to_be_focused()
            for header in region.get_by_role("columnheader").all():
                expect(header).to_have_attribute("scope", "col")
        self.assert_fits(page)

    def test_login_honors_reduced_motion_and_os_text_scaling(self):
        page = self.open_page("/login", width=390)
        expect(page).to_have_title("Sign in | Rowbook")
        expect(page.locator("meta[name='text-scale']")).to_have_attribute("content", "scale")
        self.assertIn("viewport-fit=cover", page.locator("meta[name='viewport']").get_attribute("content"))
        for element in page.locator(".animate-fade-up, .animate-fade-in").all():
            self.assertEqual(element.evaluate("el => getComputedStyle(el).animationName"), "none")
        self.assert_fits(page)


if __name__ == "__main__":
    unittest.main(verbosity=2)
