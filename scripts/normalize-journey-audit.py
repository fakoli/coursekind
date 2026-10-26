#!/usr/bin/env python3
"""Normalize the 26 October evidence without reinterpreting historical outcomes.

Run from any directory after updating walkthrough-log.json. Original source
records remain embedded verbatim; null durations never become zero.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "docs/audits/2026-10-26"
raw = json.loads((AUDIT / "walkthrough-log.json").read_text())
# Explicit later checks, not an inference that every branch now passes.
retests = {5: [10, 15, 67], 12: [56], 16: [19, 25, 28], 30: [52, 53],
           34: [55], 35: [56], 39: [44, 45], 42: [46], 50: [57, 58]}
normalized = []
for index, source in enumerate(raw):
    label = source.get("journey", source.get("id", ""))
    keys = [key for key in ("elapsed_seconds", "wall_seconds", "duration_ms") if key in source]
    assert len(keys) == 1, (index, keys)
    key = keys[0]
    value = source[key]
    seconds = None if value is None else value / 1000 if key == "duration_ms" else value
    normalized.append({
        "record": index,
        "journey_ids": list(dict.fromkeys(re.findall(r"[A-Z]+-\d{2}", label))),
        "scenario": source.get("scenario", source.get("subflow", source.get("steps", label))),
        "observed_status": source.get("status", source.get("outcome")),
        "elapsed_seconds": seconds,
        "timing_source": key,
        "timing_interpretation": "Tool-assisted subflow wall time; not whole-journey or human benchmark" if seconds is not None else "Not measured or interrupted; see original notes",
        "later_retest_records": retests.get(index, []),
        "source": source,
    })
(AUDIT / "walkthrough-normalized.json").write_text(json.dumps({
    "schema_version": 1,
    "source": "walkthrough-log.json",
    "record_count": len(normalized),
    "note": "Historical outcomes and source notes are preserved, not promoted into final journey passes. Record indices are zero-based.",
    "records": normalized,
}, indent=2) + "\n")
with (AUDIT / "subflow-timings.csv").open("w", newline="") as stream:
    fields = ["record", "journey_ids", "scenario", "observed_status", "elapsed_seconds", "later_retest_records"]
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for row in normalized:
        writer.writerow({key: "; ".join(map(str, row[key])) if isinstance(row[key], list) else row[key] for key in fields})
print(f"Normalized {len(normalized)} records; {sum(r['elapsed_seconds'] is None for r in normalized)} retain unmeasured durations")
