#!/usr/bin/env python3
"""Bundle cards/**.json + topics.json into src/data/bank.json for the app.

Each card is enriched with topic/block/difficulty pulled from topics.json, so the
app has a single self-contained data file to import. Run before dev/build.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS_DIR = ROOT / "cards"
OUT = ROOT / "src" / "data" / "bank.json"


def main() -> int:
    meta = json.loads((CARDS_DIR / "topics.json").read_text(encoding="utf-8"))
    topics = {t["n"]: t for t in meta["topics"]}

    cards = []
    ids: set[str] = set()
    for file in sorted(CARDS_DIR.glob("block-*/*.json")):
        data = json.loads(file.read_text(encoding="utf-8"))
        topic = topics[data["topic"]]
        for card in data["cards"]:
            if card["id"] in ids:
                print(f"build_bank: duplicate id {card['id']} in {file}", file=sys.stderr)
                return 1
            ids.add(card["id"])
            cards.append({
                "id": card["id"],
                "topic": data["topic"],
                "block": topic["block"],
                "difficulty": topic["difficulty"],
                "kind": card["kind"],
                "question": card["question"],
                "code": card["code"],
                "answer": card["answer"],
                "accepted": card.get("accepted", []),
                "explanation": card["explanation"],
                "tags": card.get("tags", []),
                "verify": card["verify"],
            })

    cards.sort(key=lambda c: (c["topic"], c["id"]))
    bank = {"blocks": meta["blocks"], "topics": meta["topics"], "cards": cards}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    per_block: dict[int, int] = {}
    for c in cards:
        per_block[c["block"]] = per_block.get(c["block"], 0) + 1
    print(f"build_bank: {len(cards)} cards -> {OUT.relative_to(ROOT)}")
    for b in meta["blocks"]:
        n = per_block.get(b["id"], 0)
        if n:
            print(f"  block {b['id']} {b['name']}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
