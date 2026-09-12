import os
import json
import unittest

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:3100")


class PublicSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def open_page(self, path: str, *, mobile: bool = False):
        context = self.browser.new_context(
            viewport={"width": 390, "height": 844}
            if mobile
            else {"width": 1440, "height": 900}
        )
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        response = page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
        try:
            page.wait_for_load_state("networkidle", timeout=5_000)
        except PlaywrightTimeoutError:
            # Supabase auth refresh and the Next.js dev channel may remain open.
            # Assertions below wait for the rendered application state directly.
            pass
        self.assertIsNotNone(response)
        self.assertLess(response.status, 500)
        return context, page, page_errors

    def test_public_home_has_clear_entry_point(self):
        context, page, page_errors = self.open_page("/")
        try:
            self.assertTrue(
                page.get_by_role(
                    "heading",
                    name="Weekly minutes, proof, and accountability in one place.",
                ).is_visible()
            )
            self.assertTrue(
                page.get_by_role("link", name="Sign in with Google").is_visible()
            )
            self.assertEqual(page_errors, [])
        finally:
            context.close()

    def test_login_explains_access_and_callback_failures(self):
        context, page, page_errors = self.open_page("/login?reason=not_approved")
        try:
            self.assertTrue(
                page.get_by_role("heading", name="Log in to continue").is_visible()
            )
            self.assertTrue(page.get_by_role("button", name="Sign in with Google").is_visible())
            self.assertIn("not approved", page.locator("p[role='alert']").inner_text())
            self.assertEqual(page_errors, [])
        finally:
            context.close()

    def test_sign_in_help_returns_to_login(self):
        context, page, page_errors = self.open_page("/reset-password")
        try:
            self.assertTrue(
                page.get_by_role("heading", name="Trouble signing in?").is_visible()
            )
            page.get_by_role("link", name="Back to sign in").click()
            page.wait_for_url(f"{BASE_URL}/login")
            self.assertEqual(page_errors, [])
        finally:
            context.close()

    def test_protected_areas_redirect_anonymous_visitors(self):
        for path in ("/athlete", "/coach"):
            with self.subTest(path=path):
                context, page, page_errors = self.open_page(path)
                try:
                    page.wait_for_url(f"{BASE_URL}/login")
                    self.assertTrue(
                        page.get_by_role("heading", name="Log in to continue").is_visible()
                    )
                    self.assertEqual(page_errors, [])
                finally:
                    context.close()

    def test_mobile_pages_do_not_overflow(self):
        for path in ("/", "/login", "/reset-password"):
            with self.subTest(path=path):
                context, page, page_errors = self.open_page(path, mobile=True)
                try:
                    widths = page.evaluate(
                        "() => ({ viewport: document.documentElement.clientWidth, "
                        "content: document.documentElement.scrollWidth })"
                    )
                    self.assertLessEqual(widths["content"], widths["viewport"])
                    self.assertEqual(page_errors, [])
                finally:
                    context.close()

    def test_unassigned_coach_can_retry_and_log_out(self):
        context = self.browser.new_context(viewport={"width": 320, "height": 844})
        page = context.new_page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        session = {
            "user": {
                "id": "coach-e2e",
                "email": "coach@example.test",
                "name": "E2E Coach",
                "role": "COACH",
                "status": "ACTIVE",
            },
            "expiresAt": "2027-09-11T00:00:00.000Z",
        }

        def handle_api(route):
            url = route.request.url
            if "/api/trpc/auth.getSession" in url:
                data = {
                    "json": session,
                    "meta": {"values": {"expiresAt": ["Date"]}, "v": 1},
                }
            elif "/api/trpc/coach.listTeams" in url:
                data = {"json": []}
            elif "/api/trpc/auth.logout" in url:
                data = {"json": {"success": True}}
            else:
                route.continue_()
                return
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps([{"result": {"data": data}}]),
            )

        page.route("**/api/trpc/**", handle_api)
        try:
            page.goto(f"{BASE_URL}/coach", wait_until="domcontentloaded")
            page.get_by_role("heading", name="No team assigned").wait_for()
            self.assertTrue(page.get_by_text("Signed in as E2E Coach").is_visible())
            self.assertTrue(page.get_by_role("button", name="Check again").is_visible())
            self.assertLessEqual(
                page.evaluate("document.documentElement.scrollWidth"),
                page.evaluate("document.documentElement.clientWidth"),
            )

            page.get_by_role("button", name="Log out", exact=True).click()
            page.wait_for_url(f"{BASE_URL}/login")
            self.assertEqual(page_errors, [])
        finally:
            context.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
