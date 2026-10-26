# JEV integration research

Verified 2026-10-26 from the MacBook workspace, with read-only inspection of Fakoli Dark and official TypeSafe documentation. No credential value was printed, copied, or sent to a provider. No inference call, installation, remote mutation, or fleet change was performed.

## Identity and credential location

JEV is TypeSafe's Jev, a model for typed decisions: Choice, Score, and Noul (yes/no probability). It evaluates supplied state rather than generating lesson prose. Official introduction: https://docs.typesafe.ai/introduction . This fits a complementary reviewer beside the product's text generator.

Live SSH resolution: alias `fakoli-dark-linux`, hostname `fakoli-dark-linux.tail4378d.ts.net`, user `fakoli`; remote OS hostname reports `fakoli-dark`.

Credential NAME and location only: `/home/fakoli/.env`, variable `TYPESAFE_API_KEY`, exactly one assignment, file permissions `0600`. Names were extracted without emitting values. No `JEV*` assignment was present in that file. Presence does not establish a nonempty value, current validity, account balance, or model access; root owns authorized secret setup and any bounded live acceptance call. `OPENROUTER_API_KEY` also exists, but direct TypeSafe matches the explicit Jev integration and avoids an additional provider.

Focused Hindsight recall succeeded with `memory.imported`; it supplied only historical routing evidence (a September Jev MCP review). Live checks and current official docs are authoritative. No applicable local AGENTS.md file was found along the workspace ancestry or inside the product. Remote `/data/workspaces/ai-infra/modern/AGENTS.md` was read; it requires preserving credentials, external user work, and existing services, and assigns fleet services to managed infrastructure. This task made no changes there.

## Verified API contract

Official API reference: https://docs.typesafe.ai/api/system-one and canonical OpenAPI https://api.typesafe.ai/openapi.json .

- `POST https://api.typesafe.ai/v1/systemone`
- `Authorization: Bearer <TYPESAFE_API_KEY>` and `Content-Type: application/json`.
- Body: `{model, state, questions}`. State accepts text, object, or array. Questions is a named map; each item has `type`, `instructions`, and optional/type-specific `criteria`.
- Result: `{model, answers, usage}`. Answer keys match question IDs. Usage reports input/output token counts.
- `GET https://api.typesafe.ai/v1/models` uses the same bearer authorization and lists account-accessible aliases. This can validate access without decision inference.

Noul returns `{"type":"noul", "noul": <0..1>}`. It has no separate `confidence` property. Its optional criteria explain true/false. Source: https://docs.typesafe.ai/primitives/noul .

Choice returns a chosen option, probabilities, and confidence. Score uses 2–10 ordered criteria descriptions and returns an expected position starting at zero, probabilities, a legend, and confidence. Source: https://docs.typesafe.ai/primitives/score . Confidence summarizes distribution concentration; it is not proof of correctness or an independently measured accuracy guarantee. Thresholds require application-specific evaluation. Source: https://docs.typesafe.ai/confidence .

## Current models, limits, and costs

Official model documentation checked today: https://docs.typesafe.ai/models . `jev-1.14.0` is the current stable release (October 14); `jev-latest` and `jev-preview` resolve to it. Pin `jev-1.14.0` for reproducible thresholds and retain the returned model ID.

Standard context limits: 64k tokens per request, 32k per question (state plus question). There is no independent question-count cap, provided both context limits fit. Rate limits are organization-specific, measured in requests and tokens per second; the console supplies actual limits. Published cost is $0.042 per million input tokens, with output free. Keep review snapshots small; the product should record actual reported usage rather than guess billing from characters. Long-context and image functionality require experimental headers and are unnecessary for this text review.

Official request/error rules: https://docs.typesafe.ai/api/errors . JSON must be UTF-8 without BOM, finite numbers only, at most 64 nesting levels, at most 32 MiB body. Handle 400/413/415/422 as request failures, 401 as unavailable credentials, and retry 429/529 with bounded exponential backoff. For this optional interactive review, use a short total deadline and a small retry budget. Do not assume provider idempotency support; none was established in the official pages inspected.

## Recommended product integration

Add an explicit “Review study material” action to the authoring workspace after generated or edited content is staged, before the user applies it. This is my product recommendation, not an already implemented feature. Existing `backend/services/ai_generation_service.py` validates card counts, nonempty fields, quiz counts, and answer indices; those checks remain deterministic. The existing `docs/ai-workspace-proposal.md` explicitly separates deterministic verification from reviewable teaching-quality judgments.

Send only an access-checked, bounded snapshot: relevant learning objective, lesson excerpt, and the selected card or quiz question plus options and answer key. Avoid account details, complete histories, unrelated courses, and credentials. Ask independent atomic questions in one call, for example:

```json
{
  "model": "jev-1.14.0",
  "state": {
    "objective": "...",
    "lesson_excerpt": "...",
    "question": "...",
    "options": ["...", "..."],
    "correct_index": 0
  },
  "questions": {
    "answer_supported": {
      "type": "noul",
      "instructions": "Does the lesson excerpt support the marked correct answer? Judge only the supplied material."
    },
    "answer_ambiguous": {
      "type": "noul",
      "instructions": "Could another listed option also reasonably be correct given this lesson excerpt and question?"
    },
    "objective_aligned": {
      "type": "noul",
      "instructions": "Does answering this question exercise the supplied learning objective?"
    }
  }
}
```

Return transparent advisory signals such as “Answer may need review” with dimension probabilities and an “uncertain” state. Initial thresholds are provisional product configuration, not qualified accuracy. Never present review success as certified factual correctness. Do not invent explanatory prose from a probability-only response; map known dimensions to clear fixed labels. A text generator could later propose a separately reviewable revision.

Persist a hash/revision of reviewed content, review prompt version, returned model, dimensions, provider status, timestamp and token usage. Mark the review stale after content changes. Keep a user's generated draft on timeout, rate limit, malformed/missing answer, missing key or low certainty; show “Review unavailable” or “Needs review” and allow retry. Validate finite 0–1 values and expected answer keys before using them. Replays should reuse a stored successful result rather than silently incur another call.

Do not alter quiz scores, mastery, completion, authorization, selected generation provider, or application credits based on Jev. Do not make Jev the text-generation provider. A later source-grounded rubric for free-text practice answers could fit the model, but it needs separate pedagogical evaluation and an appeal/edit path.

## Acceptance evidence and limitations

For root implementation: test synthetic good/unsupported/ambiguous cases, missing key, 401, timeout, 429/529, malformed result and revision invalidation. Validate one small synthetic live request only after secure server-side setup; inspect typed values/model/usage, not request headers. The API key must never reach frontend settings payloads or Vite bundles.

This research establishes identity, documented contract, and credential location. It does not establish account health, production latency, accuracy, organization quota, live model access, or educational reliability. Avoid similarly named community domains: their endpoint, key format, billing, and limits differ from TypeSafe's official service.
