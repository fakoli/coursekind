# Task 5 rendered acceptance handoff

Run with disposable accounts at the final reviewed commit. Record commit, outcome, screenshot and observed UI time for each; measure provider wait separately. Do not treat these authored cases as passes.

| Case | Root CUA actions and expected result |
| --- | --- |
| Goal-only first loop | Create from only a goal; defaults visible/editable; saved brief collapsed; Plan is next action; no empty course/reopen detour. Generate/review/apply, then Build defaults one module. |
| Compact mobile / desktop | At 360 px and desktop, first screen has next action and Brief/Plan/Build/Revision/Review/History navigation. After Apply, plan is a short deliberate-reopen summary; old ready jobs collapse. No primary control requires horizontal scrolling. |
| Real 200% zoom | At desktop 200% browser zoom, navigate every section and reach build, retry, review/dismiss, restore and settings. Text resizing in WORKSPACE-06 CI complements this actual browser zoom check. |
| Draft preservation | Type unsaved brief/revision instructions, close/reopen sections using keyboard; values remain. Open Plan after apply deliberately; fields/refinement and saved jobs remain available. |
| Outline and keyboard | Tab to linked course outline; Enter/Space expands it; reach module link. Section navigation opens its disclosure. Review draft focuses its region; Dismiss returns to trigger. Existing dialogs retain focus trapping and return to their trigger; no hidden disclosure child takes focus. |
| Status / partial recovery | Trigger controlled second-step failure; first draft remains, top summary reports attention, failure text shows bounded category. Reload retains state. Select only failed step and read external-charge warning; explicit Retry leaves earlier draft intact. Observe live job state and apply/restore announcements. |
| Low quota | At 25 credits a 10-credit plan leaves 15; build shows available budget and 25-credit requirement. No automatic grant or provider fallback. Failure preserves brief/plan/draft; server rejects before inference. Use only a synthetic account, never modify normal account budget. |
| Course references | Compare and restore manual path references; authorized names appear with original IDs as links. Revoke/delete an inaccessible source and reload: no cached private title is shown. |
| Account boundary | Hold a synthetic old-account request, sign out/switch accounts, then release it. No private goal/draft/job appears; old API response is rejected and caches remain empty. |
| Write gates off | Disable only disposable workspace/review gates. Writes explain disabled state, authorized saved reads stay available. Open/study an existing course and verify cards, quizzes and progress intact. Restore gates afterward. |
| Live synthetic qualification | Explicit Anvil `llm.primary`, one course/build, reused path and scoped quiz revision via bounded helper or direct UI. Verify each successful saved result in rendered viewer after reload. Record honest HTTP 503/unavailable outcome and no automatic retry/fallback. |

Run GitHub CI at the exact final head: 49 cases, zero retries, all original 40 IDs, and all backend/frontend matrix checks. Record case count separately from six workspace groups. The optional live helper writes only a new private session file outside the repository and does not print credentials; root may use it to sign in to the same new synthetic account. Production notification delivery and Codex subscription integration remain deferred.
