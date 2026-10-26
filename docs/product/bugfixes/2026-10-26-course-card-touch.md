# Course card touch navigation

The owner reported that courses did not open when tapped in iOS Safari. In the released UI, only the course title was a link; the image, description, metadata and card padding were inert despite the whole card looking interactive. Reproduced in the rendered app: description click stayed on /courses; title click opened the detail.

Changed CourseCard to use one native link covering the card, labelled by its visible title, with a visible keyboard focus ring. Add to Path and optional Course options remain separate buttons above that link, with no nested interactive elements. No course data, API, authorization or provider behavior changed.

Validation: targeted accessibility/media tests, frontend lint/build, browser test typecheck, and COURSE-06 passing in Chromium and mobile WebKit with an iPhone 13 profile (2 cases, zero retries). The test taps the title, thumbnail, description and bottom padding, checks detail and Back navigation, and confirms Add to Path opens its modal without following the card. Actual 390px rendered retest of the deployed production bundle confirmed that clicking the previously inert description now opens the course. Physical iPhone testing remains with the reporting user.

The production frontend bundle served through the existing Tailscale endpoint was rebuilt with VITE_API_URL=/api/v1. Existing backend, accounts and storage were retained. Refresh an already open Safari tab to load the new bundle. CI now includes this touch regression on mobile WebKit, and timing evidence records each browser project separately.
