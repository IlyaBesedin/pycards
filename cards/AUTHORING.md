# Card authoring guide

Cards live in `cards/block-N/NNN-slug.json`, one file per topic (NNN = topic number
from `topics.json`, zero-padded). Every card must pass `python3 tools/verify_cards.py`.

## File format

```json
{
  "topic": 2,
  "cards": [
    {
      "id": "b1-002-01",
      "kind": "output",
      "question": "What does this print?",
      "code": "words = [\"a\", \"bb\"]\nfor w in words:\n    w = w.upper()\nprint(words)",
      "answer": "['a', 'bb']",
      "accepted": [],
      "explanation": "`w` is rebound to a new uppercase string on each iteration; the list itself is never touched. Strings are immutable.",
      "tags": ["mutability", "for"],
      "verify": "exec"
    }
  ]
}
```

- `id` — `b{block}-{topic:03d}-{nn:02d}`, unique across the whole bank.
- `kind` — what the learner is asked:
  - `output` — what the program prints (stdout). Multi-line output: join lines with `\n`.
  - `exception` — does it crash, and with what? `answer` is the exception class name
    (`ValueError`, `KeyError`, `ZeroDivisionError`) or `no error`.
  - `value` — value of the **last line**, which must be a top-level expression;
    `answer` is its `repr()` — exactly what the REPL would show (`'str'`, `(1, 2)`, `None`).
  - `pytest` — `code` is a test file; `answer` is the summary (`2 passed, 1 failed`)
    or an integer = number of collected tests.
  - `truth` — `True` / `False` about the code (for things that cannot be executed:
    CI configs, HTTP, browser). Executable truth cards should be `value` cards instead.
- `verify` — `exec` (run on Python 3.12), `pytest`, or `manual` (schema check only;
  use only when the code genuinely cannot run: network, browser, external services).
- `accepted` — alternative spellings of the *same* answer (optional). Never use it to
  accept a *different* answer: `[1, 2]` vs `(1, 2)` is exactly the knowledge being tested.
- `explanation` — English, 1–3 sentences, says **why** and names the concept.
  Use backticks for code. Mention "Python 3.12" if the behaviour is version-specific.
- `tags` — optional lowercase keywords.

## Hard limits (enforced)

- `code`: ≤ 12 lines, ≤ 44 characters per line (phone screen, no wrapping), no tabs,
  no trailing whitespace.
- `answer`: ≤ 60 characters, single line except `output` kind (≤ 3 lines).
- `question`: ≤ 80 characters. `explanation`: ≤ 320 characters.
- The same `code` must not appear twice in the bank.

## Determinism rules — what NOT to put in a card

1. **Set ordering** (`print({"b", "a"})`) — string hashes are randomized per process.
   Use `sorted(...)`, `len(...)`, `in` instead. Small-int set order is a CPython detail — avoid too.
2. **Untypeable floats** (`print(10 / 3)` → `3.3333333333333335`). Test the idea another
   way: `10 // 3`, `type(10 / 3).__name__`, `0.1 + 0.2 == 0.3`. `0.30000000000000004` is
   the one canonical exception — it is the lesson.
3. **Exception messages** change between versions — that is why `exception` cards ask for
   the class name only. Put the 3.12 message in the explanation if it helps.
4. **Anything nondeterministic**: `random`, `time`, `datetime.now()`, `id()`, default
   `repr` of objects (`<__main__.A object at 0x…>`), `is` on ints/strings (interning),
   `input()`, network, environment variables, file listings.
5. **Dict order is fine** (insertion-ordered since 3.7) — use dicts freely.

The verifier runs every `exec` card three times with different `PYTHONHASHSEED` values
and rejects any card whose output differs between runs.

## What makes a good card

- One idea per card. The reader should be able to answer in under 30 seconds.
- Prefer **traps** over trivia: the "Частые ошибки" section of each topic is a list of
  ready-made misconceptions — turn each into a card.
- Cover each key snippet of the "Конспект" section with 1–3 cards.
- Mix kinds: mostly `output`, a few `exception`, some `value`. A topic with 10 cards
  should have at least 2 `exception` cards if the topic has any failure modes.
- Vary the surface: different variable names and values than the textbook, so the card
  tests understanding rather than recall of the page.
- Short code beats clever code. 3–8 lines is the sweet spot.
- Block 1 topics: 8–12 cards. Later blocks: 4–8. Conceptual topics (installation, CI,
  test pyramid): 4–6 `truth`/`value` cards are enough.

## Verifying

```bash
python3 tools/verify_cards.py                      # whole bank
python3 tools/verify_cards.py cards/block-1/002-*.json   # one file
```

The script prints every failing card with expected vs actual output. Fix the card
(or the answer) until the file is clean — never mark an executable card `manual`
to silence the verifier.
