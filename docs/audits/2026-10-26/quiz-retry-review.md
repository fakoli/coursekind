# WB-R1 targeted verification

26 October 2026, MacBook. Reviewed only `59d93cca253abcff51e6dcb341a9de55b1467602..cfe5b216edd900d7018d3cc818029237b244152f`, its supplied package and the final-fix-report appendix. No broad review, subagents, production edits or suite reruns. This report is the only file written.

## Strengths and addressed behavior

- **Immutable retry payload: addressed.** Each quiz submission now has an encounter key. Answer edits, Retry Quiz and added questions reset the draft pointer without deleting previous event requests. Both Retry study save and Finish reach the original stored request, preserving its event ID, score, answers and study time.
- **Separate submission identity: addressed.** A changed answer draft receives a new encounter key; its successful save cannot delete the older failed encounter. Unchanged-answer retries reuse their prior key.
- **Local draft/feedback preservation: addressed.** Recovery only restores submitted answers when its key is still the displayed encounter. Retrying an older encounter therefore preserves an edited draft or newer successful feedback.
- The added regressions compare complete payloads, simulate a committed event with a lost response, exercise Retry and Finish, and verify distinct attempt IDs. The reported 17 focused tests and lint are supplied evidence, not rerun results.

## Remaining important issue

**WB-R1 remains partially open — P2: an older uncommitted attempt can overwrite the persisted newer score.**

- **Files:** `frontend/src/pages/ModuleViewer.tsx:315` (new submission proceeds while an older encounter is unresolved), recovery at `:116` and Finish's unsaved-action loop; integration with `backend/services/progress_service.py:125`–135.
- **Trigger:** Attempt A (0%) fails before committing. The learner edits answers and successfully submits B (100%). Retry study save or Finish then saves the retained A. The local feedback guard correctly keeps B displayed, but the backend processes A as a new event and sets `quiz_score`/`last_quiz_at` to A. Reloaded personal progress and dashboard averages now use the older 0% result. This is distinct from the lost-response case, where the original A already exists and server replay correctly avoids another update.
- **Evidence:** A network-free probe invoked the real `ProgressService.update_module_progress` with an in-memory storage object and a synthetic authorized module. Saving B followed by the previously uncommitted A returned `after_newer=100`, `after_older_recovery=0`, `attempts=2`, `history_scores=[100,0]`. No application files, real data or transport were used. The new frontend distinct-submission test returns a dummy quiz response and asserts local feedback only, so it does not test this persisted projection.
- **Bounded repair:** Keep edits available if desired, but require all older unresolved quiz submissions to be acknowledged before submitting a newer attempt. Explain the pending-save requirement and provide recovery. Alternatively drain those attempts successfully before sending the new one. Both options preserve the existing backend's commit-order projection without introducing client timestamps or a new chronology model. A new submission must remain blocked while recovery is pending or fails. Verify the failure-before-commit case and retain both original lost-response Retry/Finish regressions.

No critical or unrelated minor findings were added. `git diff --check 59d93cc cfe5b21` passed. The coordinator's actual UI check and final CI were still in progress; this report does not claim their outcomes.

## Declined to judge

- A new chronological event-storage/projection model: unnecessary for the bounded submission-order repair and outside this targeted correction.
- Unchanged cards, authoring, media, ACL, providers and broader product/JEV work: covered or scoped separately; not reopened here.
- Repeated full suites or independently operating the coordinator's real UI checks: excluded by this assignment; reported evidence is attributed above.

## Verdict

**With fixes.** The original duplicate-event retry bug and local feedback overwrite are fixed, but WB-R1 cannot close while the permitted out-of-order recovery can overwrite the durable latest score. Resolve older pending quiz attempts before allowing a new submission, then verify that narrow path and retain the final CI gate. No merge is authorized.
