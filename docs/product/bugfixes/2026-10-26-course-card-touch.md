# Course card touch navigation

The owner reported that courses did not open when tapped in iOS Safari. In the released UI, only the course title was a link; the image, description, metadata and card padding were inert despite the whole card looking interactive. Reproduced in the rendered app: description click stayed on /courses; title click opened the detail.

Changed CourseCard to use one native link covering the card, labelled by its visible title, with a visible keyboard focus ring. Add to Path and optional Course options remain separate buttons above that link, with no nested interactive elements. No course data, API, authorization or provider behavior changed.

Validation: targeted accessibility/media tests, frontend lint/build, browser test typecheck, and COURSE-06 passing in Chromium and mobile WebKit with an iPhone 13 profile (2 cases, zero retries). The test taps the title, thumbnail, description and bottom padding, checks detail and Back navigation, and confirms Add to Path opens its modal without following the card. Actual 390px rendered retest of the deployed production bundle confirmed that clicking the previously inert description now opens the course. Physical iPhone testing remains with the reporting user.

The production frontend bundle served through the existing Tailscale endpoint was rebuilt with VITE_API_URL=/api/v1. Existing backend, accounts and storage were retained. Refresh an already open Safari tab to load the new bundle. CI now includes this touch regression on mobile WebKit, and timing evidence records each browser project separately.

## Sharing and phone layout follow-up

Course and path owner pages now show a compact Sharing disclosure, closed by default, with the saved visibility in a badge. Its native button exposes expanded state and controls the panel; opening fetches recipients, and collapsing retains unsaved visibility/email drafts. Changing resources resets the form and closes it. All existing visibility, invitation and revoke operations remain available inside. Fields stack on narrow screens, use consistent borders/spacing and 16px text. Course module controls use labeled arrow icons, titles wrap, and edit/delete actions stack on phones.

Added SHARE-06 covering course/path disclosures, touch toggles, draft retention, reload reset and field bounds at 390px in Chromium and mobile WebKit. Existing sharing tests now open the disclosure explicitly. Also repaired two earlier CI test assumptions: discovery navigation uses the course's semantic link, and the touch test searches for its synthetic public course so pagination cannot hide it as the suite accumulates fixtures. Initial local test updates incorrectly changed two path-detail heading selectors; those selectors were restored before rerunning the failures.

The frontend's 212 unit/component tests passed. Lint, production build and browser type checking passed. Actual rendered verification of the rebuilt live bundle at 390×844 confirmed closed/open Sharing layouts and wrapped module titles with compact controls. No real sharing permissions or stored content were changed. Physical iPhone Safari verification remains with the owner; mobile WebKit is automated coverage, not a physical-device test.

Targeted browser results: 12 cases passed in the initial run, including both engines' touch/disclosure cases; the two corrected path selectors then passed the focused rerun (2/2, 13.2 seconds). Full PR CI is rerun on the pushed commit.
