# Coursekind observed UI walkthroughs

This table preserves every recorded product walkthrough, including failed attempts before fixes. Times include agent/tool observation and diagnosis overhead; they are not model latency or typical human completion times. Null durations remain “Not measured.” Do not sum overlapping subflows. See the [raw log](walkthrough-log.json) for exact evidence and limits, and the [baseline audit](../2026-10-26/README.md) for the original 40 journey cases.

| Record | Journey | Observed scenario | Outcome | Seconds | Commit |
| --- | --- | --- | --- | ---: | --- |
| 0 | WORKSPACE-01 | Create from goal alone then save parameters and reload | pass | 27.349 | `374d415` |
| 1 | WORKSPACE-01 | Archive, find archived workspace, restore | pass | 18.745 | `374d415` |
| 2 | WORKSPACE-01 | Other account deep-links private workspace | pass | Not measured | `374d415` |
| 3 | WORKSPACE-01 | Open existing course twice without duplication | pass | 10.919 | `374d415` |
| 4 | WORKSPACE-06 | Two-tab stale brief recovery | pass | 26.774 | `9ae518e` |
| 5 | WORKSPACE-01 | Archive then restore in same editor and save new edit | fail | Not measured | `9ae518e` |
| 6 | WORKSPACE-02 | Existing owned path opens workspace with shared course references | pass | Not measured | `9ae518e` |
| 7 | WORKSPACE-01 | Dirty draft survives archive/restore, saves and reloads | pass | 14.814 | `d92da47` |
| 8 | WORKSPACE-06 | 360px workspace navigation and path brief creation | pass | 32.168 | `d92da47` |
| 9 | WORKSPACE-01 | Live Anvil plan attempt 1 | fail | Not measured | `ca8f8b3` |
| 10 | WORKSPACE-01 | Explicit live Anvil retry during local model maintenance | blocked-provider-unavailable | Not measured | `ca8f8b3` |
| 11 | WORKSPACE-01 | Explicit retry after selecting mock OpenAI | pass | 6.553 | `a1e6f33` |
| 12 | WORKSPACE-01 | Edit saved plan, reload, apply private course | pass | 15.014 | `a1e6f33` |
| 13 | WORKSPACE-01 | Build first lesson, reload, dismiss/reopen review, apply and study | pass | 36.022 | `a1e6f33` |
| 14 | WORKSPACE-02 | Plan new path with explicitly selected foreign course, reorder, apply, inspect path | pass | 35.990 | `a1e6f33` |
| 15 | WORKSPACE-03 | Partial two-module batch and selected-step recovery | pass | 31.166 | `a1e6f33` |
| 16 | WORKSPACE-01 | Generated content study continuity before revisions | pass | 95.423 | `a1e6f33` |
| 17 | WORKSPACE-04 | Quiz-only revision, study, reload and compensating restore | pass | 154.031 | `928d7f9` |
| 18 | WORKSPACE-04 | Original editor changes while proposal pending, conflict and explicit regenerate | pass | 142.006 | `928d7f9` |
| 19 | WORKSPACE-04 | Read and apply module draft saved before revision upgrade | pass | 35.096 | `928d7f9` |
| 20 | WORKSPACE-04 | Manual path reference removal, saved proposal recovery and restore | pass | 218.263 | `cc6fd8f` |
| 21 | WORKSPACE-05 | Explicit current material disclosure and live three-dimension JEV review | pass | 26.615 | `acfbfd2` |
| 22 | WORKSPACE-05 | Reload, identical selection cache and restore invalidation | pass | Not measured | `acfbfd2` |
| 23 | WORKSPACE-05 | Unavailable, malformed response, explicit retry and staged draft review | pass | Not measured | `acfbfd2` |
| 24 | WORKSPACE-05 | Same-module shortened lesson and removed selected question recovery | pass | Not measured | `06b17dc` |
| 25 | WORKSPACE-06 | Feature-off rollback preserves saved workspace and ordinary study | pass | Not measured | `06b17dc` |
| 26 | WORKSPACE-01 | Disabled activity count normalization and review focus recovery | pass | 19.832 | `095542c` |
| 27 | WORKSPACE-06 | Compact 360px navigation, keyboard disclosure and unsaved draft preservation | pass | Not measured | `095542c` |
| 28 | WORKSPACE-06 | Real Chrome 200% zoom, six sections, review focus and primary Next recovery | pass | Not measured | `4744158` |
| 29 | WORKSPACE-06 | Held old-account response arrives after sign-out and account switch | pass | Not measured | `4744158` |
| 30 | WORKSPACE-06 | Insufficient local quota preserves drafts and rejects before provider call | pass | Not measured | `4744158` |
| 31 | WORKSPACE-04 | Readable manual path comparison and saved-versus-new focus recovery | partial-fail | Not measured | `4744158` |
| 32 | WORKSPACE-06 | Revoked reused-course access hides title but blocks workspace repair controls | partial-fail | Not measured | `4744158` |
| 33 | WORKSPACE-01 | Fresh goal-only entry through reviewed plan, default module build and study entry | pass | 59.500 | `4744158` |
| 34 | WORKSPACE-01 | Study new generated module and continue with saved learning records | pass | Not measured | `4744158` |

The final product acceptance report identifies which later checks close earlier failures. A historical passing checkpoint does not establish final-head acceptance.
