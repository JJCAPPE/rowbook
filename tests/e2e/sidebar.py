"""Desktop sidebar interaction checks against local Next with mocked APIs.

Run: python3 tests/e2e/sidebar.py --base-url http://localhost:3100
"""
import argparse
import os
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

from weekly_reveal import Server, open_page


def check_layout(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


def check_desktop(browser, args, role, reduced=False):
    server = Server(role=role)
    server.seen.add(server.key())
    context, page, errors = open_page(browser, server, args, clock=False, reduced=reduced)
    try:
        sidebar = page.locator("nav").first
        links = sidebar.get_by_role("link")
        active = sidebar.locator('[aria-current="page"]')
        label = active.locator("span")
        page.mouse.move(600, 700)
        expect(sidebar).to_have_css("width", "72px")
        expect(label).to_have_css("opacity", "0")
        main_box = page.locator("main").bounding_box()
        icon_boxes = [icon.bounding_box() for icon in sidebar.locator("svg").all()]
        expected_links = {"Rowbook home": "/"}
        expected_links.update(
            {"Dashboard": "/athlete", "Log": "/athlete/log", "History": "/athlete/history", "Leaderboard": "/athlete/leaderboard"}
            if role == "ATHLETE"
            else {name: f"{path}?teamId=preview-team" for name, path in (("Overview", "/coach"), ("Review", "/coach/review"), ("Settings", "/coach/settings"))}
        )
        assert links.count() == len(expected_links)
        for name, href in expected_links.items():
            expect(sidebar.get_by_role("link", name=name, exact=True)).to_have_attribute("href", href)

        # Tab reveals labels without hover and keeps every focused link outlined.
        for index in range(links.count()):
            page.keyboard.press("Tab")
            expect(links.nth(index)).to_be_focused()
            expect(sidebar).to_have_css("width", "256px")
            expect(label).to_have_css("opacity", "1")
            expect(links.nth(index)).to_have_css("outline-style", "solid")
            expect(links.nth(index)).to_have_css("outline-width", "2px")
        page.keyboard.press("Tab")
        expect(sidebar).to_have_css("width", "72px")

        sidebar.hover(position={"x": 35, "y": 180})
        expect(sidebar).to_have_css("width", "256px")
        expect(label).to_have_css("opacity", "1")
        assert page.locator("main").bounding_box() == main_box
        assert [icon.bounding_box() for icon in sidebar.locator("svg").all()] == icon_boxes
        if reduced:
            expect(sidebar).to_have_css("transition-duration", "0s")
            expect(label).to_have_css("transition-duration", "0s")
        else:
            assert "0.28s" in sidebar.evaluate("el => getComputedStyle(el).transitionDuration")
        check_layout(page)

        # A mouse click must not latch the keyboard expansion state on.
        active.click()
        page.mouse.move(600, 700)
        expect(sidebar).to_have_css("width", "72px")
        expect(label).to_have_css("opacity", "0")
        assert page.locator("main").bounding_box() == main_box
        assert not errors and not server.unknown, (errors, server.unknown)
        print(f"PASS {role}: hover, keyboard, mouse click, fixed content/icons, routes, reduced motion={reduced}")
    finally:
        context.close()


def check_breakpoints(browser, args, role):
    server = Server(role=role)
    server.seen.add(server.key())
    context, page, errors = open_page(browser, server, args, clock=False)
    try:
        sidebar, bottom = page.locator("nav").first, page.locator("nav").last
        for width in (320, 390, 767, 768):
            page.set_viewport_size({"width": width, "height": 844})
            page.mouse.move(width - 10, 300)
            if width < 768:
                expect(sidebar).to_be_hidden()
                expect(bottom).to_be_visible()
                assert page.locator("main").bounding_box()["x"] == 0
                for link in bottom.get_by_role("link").all():
                    box = link.bounding_box()
                    assert box["width"] >= 44 and box["height"] >= 44
                    assert box["x"] >= 0 and box["x"] + box["width"] <= width
            else:
                expect(sidebar).to_have_css("width", "72px")
                expect(sidebar).to_be_visible()
                expect(bottom).to_be_hidden()
                assert page.locator("main").bounding_box()["x"] == 72
            check_layout(page)
        assert not errors and not server.unknown, (errors, server.unknown)
        print(f"PASS {role}: 320/390/767/768px layouts and mobile targets")
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("E2E_BASE_URL", "http://localhost:3100"))
    args = parser.parse_args()
    assert urlparse(args.base_url).hostname in ("localhost", "127.0.0.1", "::1"), "Use a local app server"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for role in ("ATHLETE", "COACH"):
                check_desktop(browser, args, role)
                check_desktop(browser, args, role, reduced=True)
                check_breakpoints(browser, args, role)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
