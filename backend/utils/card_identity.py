"""Stable identities for legacy cards without IDs; never infer reviews from indexes."""

import json
from uuid import NAMESPACE_URL, uuid5


def identified_cards(module_id: str, cards: list[dict]) -> list[dict]:
    seen: dict[str, int] = {}
    result = []
    for card in cards:
        card = dict(card)
        fingerprint = json.dumps(
            [card.get("front"), card.get("back"), card.get("visual")], ensure_ascii=False
        )
        occurrence = seen.get(fingerprint, 0)
        seen[fingerprint] = occurrence + 1
        card["id"] = card.get("id") or str(
            uuid5(NAMESPACE_URL, f"card:{module_id}:{fingerprint}:{occurrence}")
        )
        result.append(card)
    return result
