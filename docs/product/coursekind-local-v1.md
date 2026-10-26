# Coursekind local v1 operating guide

Coursekind turns a goal into a private course or a path of one to three courses. Existing repository, API routes, package names, storage paths and saved IDs retain their original identities. This guide describes local operation; it does not authorize public deployment.

## First learning loop

1. Open Workspaces and enter a learning goal. Review the visible defaults: course scope, five flashcards and three quiz questions, with editable audience and learning preferences. Create saves a brief without creating an empty course.
2. Generate a plan. Anvil `llm.primary` is the default. Review the assumptions, course titles and module outline; edit manually for free or explicitly refine with AI. A new course has one to six proposed modules; a path contains up to three courses and at most eighteen new modules. Existing manually authored libraries are not constrained by these limits.
3. Apply the reviewed plan. The saved brief and applied plan collapse. Use the Brief, Plan, Build, Revision, Review and History links to reopen sections. These disclosures keep their components mounted, preserving unsaved text while switching sections.
4. Build defaults to one incomplete module, with at most three selected sequentially. Check provider/model, available Anvil budget and activity counts before starting. Valid enabled counts are 1–20 cards and 1–10 questions. Disabled activity counts are normalized without weakening enabled validation.
5. Review the saved draft, then explicitly Apply. Open the resulting module and study it. Generation alone does not count as learning activity. Earlier completed jobs are compact summaries; failures and current jobs remain discoverable.
6. Revise only the chosen lesson, cards, quiz, course details/outline or path references. Compare changes, apply and use History to restore prior content. A stale apply/restore rejects safely and retains the draft. Creation entries are not deletable undo operations.

Existing courses and paths offer Open in workspace. Explicit path reuse keeps original authorship and never grants edit access to a source. Current-access checks govern reads, generation, polling, apply and restore. Course titles in reference comparisons come from current authorized reads; failures show a neutral reference label.

## Costs and recovery

Application credits are a local usage quota, not money. Plans/refinements and course/path refinements cost 10; full modules and lesson revisions cost 25; cards cost 8; quiz revisions cost 10. A full module already includes requested activities. Manual editing, Apply and Restore cost zero. Successful BYOK records zero Anvil debit, while the external provider may bill the key owner.

A plan costing 10 followed by a module costing 25 needs at least 35 available credits. An account with 25 cannot finish that sequence using Anvil without more quota. The preflight shows the current balance and recovery choices: reduce a batch when affordable, edit manually, explicitly choose configured BYOK, or ask the local administrator to review quota. The application does not grant credits automatically. The backend checks the quota before inference and before saving/debiting.

Validated drafts are billed when saved, even before Apply. Generation receipts avoid duplicate application debits. Provider HTTP 503, rate limits, authentication failures, timeout/connection failures and invalid output use bounded safe diagnostics. No provider body, prompt, credential or URL is copied into the job error. Unknown internal failures receive separate generic operator guidance. Failures do not trigger a fallback provider.

A failed batch keeps earlier drafts. Remaining steps require explicit selection and Retry. After process restart, queued/running steps become interrupted; polling never resumes inference. Unknown external outcomes may already have incurred charges. Retry captures the currently selected provider/model and warns about this uncertainty. A staged validated draft finalizes without another model call. Cancellation prevents remaining calls; already claimed inference may finish and be billed.

## Supported installation and configuration

The qualified backend runtime is Python 3.12; the compatibility suite also exercises the installed Python 3.14 runtime. From `backend`, run `uv sync --locked --dev --python 3.12`, then `uv run --locked --python 3.12 uvicorn main:app --port 8010`. Use a single application process. `backend/uv.lock` records dependency resolution; CI clean installs use `--locked`. From `frontend`, use Node 24 and `npm ci`, then `npm run dev`. The Mac authoring environment uses `/opt/homebrew/opt/node@24/bin` first in PATH.

JSONStorage and SQLiteStorage are the qualified workspace backends. Their transactions and restart behavior are tested. No distributed runner, multi-process coordination or multi-file JSON power-loss atomicity is claimed. The legacy Supabase adapter is not qualified for workspaces. Workspace collections are additive: existing courses, modules, paths, practice, progress and sharing require no destructive migration.

`WORKSPACE_ENABLED` gates workspace writes; reads remain available to authorized owners during rollback. `WORKSPACE_REVIEW_ENABLED` gates optional advisory requests. Optional backend `TYPESAFE_API_KEY` enables the explicit Jev service. No key belongs in Vite/browser variables or committed files. Retain the existing credential encryption key with protected configuration when backing up encrypted BYOK records; do not regenerate it casually.

Jev uses `jev-1.14.0` and selected objective, lesson excerpt and quiz material only after explicit disclosure. Its probability results are advisory, cannot affect scores/completion/authorization, and do not incur Anvil credits. No prose verdict is invented from probabilities.

## Backup, restore and rollback

Stop the application process before copying data. For JSON, copy the entire configured storage directory together, retaining every collection and referenced local asset. For SQLite, close the application/database first and copy the database and any remaining journal/WAL sidecars consistently. Preserve protected configuration/credential encryption material separately with restrictive access. Do not place secrets in an audit or repository.

Restore to a separate test directory/database path first. Verify file hashes and parse/read representative records using the matching storage backend; start only a disposable validation instance against that path if a rendered check is needed. Confirm owner access, course/module IDs, jobs, progress and history before considering replacement. Root's [stopped-process backup checks](../audits/2026-10-26-coursekind/backup-restore-checks.json) verify disposable JSON and SQLite round trips; they do not certify power-loss recovery.

For feature rollback, disable workspace writes and optional reviews while leaving existing material and additive records intact. Existing courses, modules, study records, sharing and manual editors remain usable. Do not delete workspace collections or downgrade to code that performs a destructive migration. Restart recovery is explicit; do not rerun unknown provider attempts automatically.

## Bounded live qualification

The opt-in `backend/scripts/smoke_workspace.py` requires `--base-url`, a `--fixture-prefix synthetic-...`, and a new private `--session-file` outside the repository. Example from backend:

```bash
uv run --locked --python 3.12 python scripts/smoke_workspace.py \
  --base-url http://127.0.0.1:8011 \
  --fixture-prefix synthetic-local-v1 \
  --session-file /tmp/coursekind-synthetic-session.json
```

The helper refuses missing/non-loopback/credential-bearing targets, creates a new synthetic account and reads only material it creates. Current registration initializes 100 credits; an existing normal account balance of 25 is not the registration default. The helper prints available quota and never grants credits. It never lists user courses, changes provider settings, reads provider secrets, sends notifications or mutates fleet state. It attempts one small course/build, one reused path and one scoped quiz revision; the maximum successful Anvil debit is 55 credits. It stops on a failed or timed-out job without automatic retry. Its private session file lets root inspect the same account in the actual UI or continue manually; credentials never print. Rerunning with that file is refused, and the script does not automatically resume an old job. Console receipts include fixture, provider/model, state, attempts, application credits and elapsed wait, but no lesson/prompt or provider body. External cost stays unknown. Root records active UI time separately and confirms persisted material after reload.

## Acceptance boundaries

The original 40 baseline cases remain. Added workspace scenarios cover six named journey groups. Local pytest/Vitest/lint/build and scenario type/list checks are deterministic evidence, not remote CI or browser acceptance. Root alone performs actual CUA walkthroughs and records exact-commit GitHub CI outcomes, screenshots, zoom/keyboard/focus behavior and live provider outcomes in the product audit.

Two earlier live Anvil plans returned HTTP 503 with zero application debits; this historical failure remains even if later attempts succeed. Task 4's live Jev result and explicit disclosure have separate root evidence. No live inference or delivery was performed by the Task 5 worker. Public deployment, OAuth/subscription integration, production notification delivery, legal/trademark clearance, distributed persistence and adoption metrics remain outside this local v1. Codex CLI subscription support stays deferred after failed isolation qualification; API-key OpenAI remains available.
