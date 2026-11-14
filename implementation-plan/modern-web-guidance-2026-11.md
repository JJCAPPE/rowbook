# Modern Web Guidance application review

Reviewed on November 14, 2026 against [GoogleChrome/modern-web-guidance-src](https://github.com/GoogleChrome/modern-web-guidance-src), repository revision `5e5cd33a7738f21281e3027732bcbd58cfa82bf1`.

The repository is a catalog of web-platform patterns, not a checklist of features every site should implement. This pass maps relevant guidance to Rowbook's existing athlete and coach workflows. It preserves the current visual identity, authentication model, workout credit rules, and existing uncommitted work. No dependencies were added.

## Applied guidance

| Area | Rowbook change | Primary guidance |
| --- | --- | --- |
| Navigation and keyboard access | Added a skip-to-content target, visible focus treatment, semantic header, distinct server-rendered route titles, and clearer pressed-state semantics for filters. | [Accessibility](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/accessibility/accessibility/guide.md) |
| Mobile and text scaling | Added safe-area spacing and `viewport-fit=cover`; made navigation, headers, and actions wrap; increased touch targets; opted into OS text scaling with `text-scale=scale`. | [Responsive design](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/css/responsive-design/guide.md), [OS text scaling](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/accessibility/respect-os-text-scale/guide.md), [Typography](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/visual-design/typography/guide.md) |
| Workout forms | Associated field errors with inputs, announced actionable errors, exposed required/optional fields and activity selection, added numeric keyboard hints, and prevented editing fields while an edit submission is in progress. | [Forms](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/forms/forms/guide.md), [Accessible error announcement](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/accessibility/accessible-error-announcement/guide.md), [Validation after interaction](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/forms/validate-input-after-interaction/guide.md) |
| Dialogs | Used native modal dialog behavior for proof viewing; retained HeroUI for existing confirmation dialogs, gave Cancel initial focus, and prevented dismissal during a pending destructive operation. | [Dialog](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/ui-components/dialog/guide.md), [Prevent background scrolling](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/ui-behaviors/prevent-page-scroll-under-modal-dialog/guide.md), [Light dismissal](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/ui-behaviors/light-dismiss-a-dialog/guide.md) |
| Charts and tabular data | Added native disclosures containing semantic data tables; made wide tables keyboard-scrollable; kept week labels visible while scrolling; exposed the goal ring through native progress semantics; added leaderboard filter counts and empty-state feedback. Missing heart-rate samples remain gaps. | [Accessible charts and tables](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/accessibility/accessibility/guide.md), [Responsive tables](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/ui-atoms/responsive-table/guide.md), [Progress ring](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/ui-components/progress-ring/guide.md) |
| Motion and loading | Enabled HeroUI's existing user motion preference, removed decorative chart drawing animations, and applied reduced-motion alternatives to existing CSS effects. Deferred the weekly reveal module until a recap is available, with the existing loading screen as its fallback. | [Motion](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/ui-behaviors/motion/guide.md), [Performance](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/performance/performance/guide.md), [Conditional dependencies](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/performance/conditional-async-dependencies/guide.md) |

Route titles use static Next metadata in server layouts or pages. Client pages retain their existing boundaries. The root title template supplies `| Rowbook`; dynamic athlete/week pages use descriptive static titles without exposing personal information in metadata or introducing server data requests.

## Reviewed without introducing new features

- **Images and fonts:** reviewed [image priority](https://github.com/GoogleChrome/modern-web-guidance-src/blob/main/guides/performance/optimize-image-priority/guide.md). There is no photographic hero image to prioritize. Existing `next/font` Latin subsets and font delivery remain in place. Visible proof images must remain readily available for reviewing workouts.
- **Performance scheduling and containment:** no measured long task or sufficiently large rendering workload justified a worker, `scheduler.yield()`, or blanket `content-visibility`. Small dashboard sections keep normal rendering. No quantified speed improvement is claimed without production measurements.
- **Service workers and PWA features:** offline writes, background sync, installation prompts, notifications, file handlers, and shared caches require separate product and data-lifecycle decisions. They are not necessary to improve the existing workflows, and broad caching of authenticated workout data was not introduced.
- **Authentication and security:** no replacement of Google sign-in with passkeys or additional password forms. Existing authorization, upload validation, and database rules remain responsible for trust boundaries. This UX pass is not a security audit.
- **Built-in AI, WebMCP, WebAssembly, custom elements, and extension-specific patterns:** these catalog categories do not solve an identified Rowbook interaction problem. No new browser capability, dependency, or user permission was introduced for them.
- **Decorative effects and new controls:** no new carousels, scroll-linked effects, parallax, custom select engines, or theme switch. Native selects, native disclosures, and the installed component library already fit the current tasks.

## Browser behavior and fallback

- Native `<dialog>`, `<details>`, and `<progress>` provide platform semantics; chart data remains available as ordinary HTML tables.
- Unsupported `text-scale` metadata is ignored; browser zoom still works. No root font-size override or duplicate manual text scaling was added.
- Text wrapping is a progressive enhancement. Explicit field errors and validation remain available independently of their styling.
- Safe-area environment values include ordinary padding fallbacks. The viewport does not disable zoom.
- The progress ring keeps its existing SVG visual and adds native semantics rather than requiring newer gradient/border APIs.
- Existing weekly reveal pause controls and reduced-motion behavior remain in place; the reveal sequence and persistence behavior were preserved.
- **Verified compatibility exception:** WebKit allowed the page to scroll beneath the native proof dialog despite dialog/backdrop overscroll containment. A scoped `html:has(dialog[data-proof-viewer]:modal)` scroll lock restores the previous behavior. A stable scrollbar gutter prevents the desktop layout shift warned about by the source guide. This is an intentional exception based on a reproduced browser failure.

## Pull request scope and verification

Prepared on top of main revision `c26f252`, preserving the expanding desktop
sidebar and existing Temple loading screens. Unrelated pending team analytics
and inline coach evidence-gallery work are excluded. The chart accessibility
changes apply to main's existing team-minutes and heart-rate chart. No backend,
database schema, dependencies, or workout-credit rules change in this PR.

The production build on this branch was tested at `http://localhost:3104`:

- Production build (including TypeScript), ESLint, and `git diff --check` passed.
- All 122 unit tests passed.
- All 7 public smoke tests passed.
- All 13 workout-save tests passed in Chromium and WebKit, including invalid-input
  focus, bounded retries, identical retry payloads, and draft preservation.
- All 15 weekly-reveal scenarios passed, including five viewport sizes, timing,
  reduced motion, retries, account/team changes, and week rollover.
- All 5 modern-web UX tests passed in Chromium and WebKit: keyboard navigation,
  accessible chart data, coach tables, mobile touch targets, 320px reflow at
  200% text, reduced motion, and route titles.
- All 4 proof-dialog tests passed in both engines, including 320/390/768px
  subcases, initial and return focus, gallery controls, scroll containment,
  light dismissal, and failed-image retry.
- The complete loading/recovery suite passed, including deletion failure/retry
  and cancellation prevention while deletion is pending.
- Sidebar regression checks passed for both roles, hover and keyboard operation,
  reduced motion, and 320/390/767/768px layouts. Additional Chromium and WebKit
  checks confirmed reachable, unclipped desktop navigation at 200% text.

The initial workout-save run encountered the newly merged hover sidebar
covering the retry button after navigation. Its browser test now moves the
pointer off the sidebar and waits for collapse before clicking the button.

These UI checks intercept application APIs. A prior broader working-tree run
also passed a real local Supabase Auth/Storage/PostgreSQL workflow; that result
is historical context, not a real-service run of this exact PR branch. Live
Google OAuth, real AI extraction, physical devices, screen-reader sessions,
and field performance measurements remain outside this verification.
