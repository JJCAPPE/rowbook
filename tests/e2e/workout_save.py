"""Workout save recovery checks; application APIs are intercepted, with no live writes.

Run against local Next: python tests/e2e/workout_save.py
"""
import json
import os
import unittest
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("E2E_BASE_URL", "http://localhost:3100")
ATHLETE = "save-test-athlete"
SUBMISSION = "02f4ad3b-3c39-4bbc-ae78-0ab9de8ebafc"
STORAGE_KEY = f"rowbook:workout-draft:v2:{ATHLETE}"
VALUES = {"activityType": "ERG", "date": "2026-10-29", "minutes": 42,
          "distanceKm": 10, "avgHr": 150, "notes": "Save regression"}


class SaveServer:
    def __init__(self, outcomes):
        self.outcomes, self.calls, self.entries = list(outcomes), [], {}
        self.hanging = []

    def intercept(self, route):
        request, parsed = route.request, urlparse(route.request.url)
        names = unquote(parsed.path.split("/api/trpc/")[1]).split(",")
        raw = request.post_data_json if request.method == "POST" else {}
        results = []
        for index, name in enumerate(names):
            if name == "auth.getSession":
                value = {"user": {"id": ATHLETE, "name": "Save test", "email": "save@example.test",
                                  "role": "ATHLETE", "status": "ACTIVE"},
                         "expiresAt": "2027-01-01T00:00:00.000Z"}
            elif name == "weeklyReveal.getPending":
                value = None
            elif name == "athlete.createEntry":
                payload = raw[str(index)]["json"]
                self.calls.append(payload)
                outcome = self.outcomes.pop(0) if self.outcomes else "success"
                if outcome in ("success", "lost-response"):
                    previous = self.entries.setdefault(payload["clientSubmissionId"], payload)
                    assert previous == payload, "A retry changed an already saved workout"
                if outcome in ("network", "lost-response"):
                    route.abort("failed")
                    return
                if outcome == "hang":
                    self.hanging.append(route)
                    return
                if outcome != "success":
                    code, message = outcome
                    results.append({"error": {"json": {"message": message, "code": -32600,
                                    "data": {"code": code, "httpStatus": 400 if code == "BAD_REQUEST" else 401,
                                             "path": name}}}})
                    continue
                value = {"entry": {"id": "saved-entry", "validationStatus": "VERIFIED"}}
            else:
                value = []
            results.append({"result": {"data": {"json": value}}})
        statuses = {item["error"]["json"]["data"]["httpStatus"] if "error" in item else 200 for item in results}
        route.fulfill(status=statuses.pop() if len(statuses) == 1 else 207, content_type="application/json",
                      body=json.dumps(results if "batch" in parse_qs(parsed.query) else results[0]))


class WorkoutSaveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            headless=True, **({"channel": os.environ["E2E_BROWSER_CHANNEL"]}
                             if "E2E_BROWSER_CHANNEL" in os.environ else {}))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def open_form(self, outcomes=(), values=None, pending=False, mobile=False):
        server = SaveServer(outcomes)
        context = self.browser.new_context(viewport={"width": 390, "height": 844} if mobile
                                           else {"width": 1440, "height": 900})
        self.addCleanup(context.close)
        context.route("**/api/trpc/**", server.intercept)
        draft = {"version": 2, "athleteId": ATHLETE, "clientSubmissionId": SUBMISSION,
                 "values": values or VALUES, "readyProofs": [{"name": "proof.jpg", "proofImageId": "proof-fixture"}],
                 "unfinishedFileCount": 0,
                 "pendingIntent": {"values": values or VALUES, "proofImageIds": ["proof-fixture"]} if pending else None}
        context.add_init_script("""if (!sessionStorage.getItem('save-test-seeded')) {
            sessionStorage.setItem('save-test-seeded', '1');
            sessionStorage.setItem(%s, %s);
        }""" % (json.dumps(STORAGE_KEY), json.dumps(json.dumps(draft))))
        page = context.new_page()
        page.clock.install(time="2026-10-29T16:00:00Z")
        page.goto(BASE_URL + "/athlete/log", wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="Log workout", exact=True)).to_be_visible()
        expect(page.locator("#minutes")).to_have_value(str((values or VALUES)["minutes"]))
        return page, server

    def test_fractional_minutes_can_be_corrected_before_sending(self):
        page, server = self.open_form(values={**VALUES, "minutes": 42.5}, mobile=True)
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.locator("#minutes-error")).to_contain_text("whole minutes")
        self.assertEqual(server.calls, [])
        page.locator("#minutes").fill("42")
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(server.calls[0]["clientSubmissionId"], SUBMISSION)

    def test_old_date_is_explained_before_sending(self):
        page, server = self.open_form(values={**VALUES, "date": "2026-10-21"})
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.locator("#date-error")).to_contain_text("last 7 days")
        self.assertEqual(server.calls, [])

    def test_heart_rate_matches_server_validation_without_changing_retry_values(self):
        page, server = self.open_form(values={**VALUES, "avgHr": 0.1})
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.locator("#average-hr-error")).to_contain_text("positive heart rate")
        self.assertEqual(server.calls, [])
        page.locator("#avgHr").fill("149.6")
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(server.calls[0]["avgHr"], 149.6)

        page, server = self.open_form(values={**VALUES, "avgHr": 149.6}, pending=True)
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(server.calls[0]["avgHr"], 149.6)

    def test_existing_invalid_pending_draft_can_be_corrected(self):
        page, server = self.open_form(values={**VALUES, "minutes": 42.5}, pending=True)
        expect(page.get_by_role("button", name="Save workout", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Restore retry details")).to_have_count(0)
        page.locator("#minutes").fill("42")
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(server.calls[0]["clientSubmissionId"], SUBMISSION)
        self.assertEqual(server.calls[0]["proofImageIds"], ["proof-fixture"])

    def test_existing_valid_pending_draft_can_retry_after_date_window(self):
        page, server = self.open_form(values={**VALUES, "date": "2026-10-21"}, pending=True)
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(server.calls[0]["date"], "2026-10-21")

    def test_restore_retry_details_clears_changed_optional_heart_rate(self):
        page, server = self.open_form(values={**VALUES, "avgHr": None}, pending=True)
        page.locator("#avgHr").fill("150")
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.get_by_text("These details changed after an interrupted save.", exact=False)).to_be_visible()
        page.get_by_role("button", name="Restore retry details").click()
        expect(page.locator("#avgHr")).to_have_value("")
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(len(server.calls), 1)
        self.assertIsNone(server.calls[0]["avgHr"])

    def test_definitive_rejection_keeps_draft_and_allows_correction(self):
        message = "One or more proof images expired. Upload them again."
        page, server = self.open_form([("BAD_REQUEST", message), "success"])
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_text(message, exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Restore retry details")).to_have_count(0)
        page.locator("#notes").fill("Corrected workout")
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual([call["clientSubmissionId"] for call in server.calls], [SUBMISSION] * 2)

    def test_lost_response_retries_identical_payload_without_duplicates(self):
        page, server = self.open_form(["lost-response", "success"])
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(len(server.calls), 2)
        self.assertEqual(server.calls[0], server.calls[1])
        self.assertEqual(len(server.entries), 1)
        self.assertIsNone(page.evaluate("key => sessionStorage.getItem(key)", STORAGE_KEY))

    def test_hung_request_retries_and_late_response_cannot_clear_new_draft(self):
        page, server = self.open_form(["hang", "success"])
        page.get_by_role("button", name="Save workout", exact=True).click()
        page.wait_for_timeout(100)
        self.assertEqual(len(server.hanging), 1)
        page.clock.run_for(21_000)
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(server.calls, [server.calls[0]] * 2)
        page.locator("#minutes").fill("60")
        server.hanging[0].fulfill(status=200, content_type="application/json", body=json.dumps([
            {"result": {"data": {"json": {"entry": {"id": "saved-entry", "validationStatus": "VERIFIED"}}}}}
        ]))
        page.wait_for_timeout(100)
        expect(page.locator("#minutes")).to_have_value("60")

    def test_schema_rejection_shows_readable_field_message(self):
        issues = [{"path": ["minutes"], "message": "Expected integer, received float"}]
        page, server = self.open_form([("BAD_REQUEST", json.dumps(issues))])
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_text("minutes: Expected integer, received float", exact=True)).to_be_visible()
        expect(page.get_by_role("button", name="Save workout", exact=True)).to_be_visible()
        self.assertEqual(len(server.calls), 1)

    def test_unmounted_form_cannot_clear_a_later_draft(self):
        page, server = self.open_form(["hang", "success"])
        page.get_by_role("button", name="Save workout", exact=True).click()
        page.wait_for_timeout(100)
        self.assertEqual(len(server.hanging), 1)
        page.get_by_role("link", name="History", exact=True).first.click()
        expect(page.get_by_role("heading", name="Weekly history", exact=True)).to_be_visible()
        page.get_by_role("link", name="Log", exact=True).first.click()
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        page.locator("#minutes").fill("60")
        server.hanging[0].fulfill(status=200, content_type="application/json", body=json.dumps([
            {"result": {"data": {"json": {"entry": {"id": "saved-entry", "validationStatus": "VERIFIED"}}}}}
        ]))
        page.wait_for_timeout(100)
        expect(page.locator("#minutes")).to_have_value("60")
        draft = json.loads(page.evaluate("key => sessionStorage.getItem(key)", STORAGE_KEY))
        self.assertEqual(draft["values"]["minutes"], 60)

    def test_ambiguous_save_stays_pinned_after_rejection_and_reload(self):
        page, server = self.open_form(["network", ("BAD_REQUEST", "Proof expired")])
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_role("button", name="Retry save", exact=True)).to_be_visible()
        self.assertEqual(len(server.calls), 2)
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("button", name="Retry save", exact=True)).to_be_visible()
        page.locator("#minutes").fill("43")
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.get_by_text("These details changed after an interrupted save.", exact=False)).to_be_visible()
        self.assertEqual(len(server.calls), 2)
        page.get_by_role("button", name="Restore retry details").click()
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.get_by_text("Workout saved.", exact=False)).to_be_visible()
        self.assertEqual(server.calls, [server.calls[0]] * 3)

    def test_retries_are_bounded_and_auth_error_preserves_draft(self):
        page, server = self.open_form(["network"] * 3 + [("UNAUTHORIZED", "UNAUTHORIZED")])
        page.get_by_role("button", name="Save workout", exact=True).click()
        expect(page.get_by_role("button", name="Retry save", exact=True)).to_be_visible(timeout=10000)
        self.assertEqual(len(server.calls), 3)
        page.get_by_role("button", name="Retry save", exact=True).click()
        expect(page.get_by_text("Your session expired.", exact=False)).to_be_visible()
        self.assertEqual(len(server.calls), 4)
        draft = json.loads(page.evaluate("key => sessionStorage.getItem(key)", STORAGE_KEY))
        self.assertEqual(draft["pendingIntent"]["values"], VALUES)
        self.assertEqual(draft["clientSubmissionId"], SUBMISSION)


if __name__ == "__main__":
    unittest.main(verbosity=2)
