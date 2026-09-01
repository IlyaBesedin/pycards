# pycards

Mobile-first flashcards for learning Python the way interviews test it:
read a short snippet, decide **what it prints** (or whether it crashes and with what),
then check yourself.

Cards are generated from a personal Notion curriculum
«Python для автоматизации тестирования» (120 topics in 7 blocks:
Python basics, algorithms, test automation, UI/API/DB, PyTest, Requests, Playwright).

## How it works

- Pick a block (and optionally topics / difficulty), start a session.
- Type the answer, then tap **Check** — or tap **Answer** to reveal it and grade yourself.
- Correct cards swipe right, wrong ones swipe left and come back after 10–15 other cards.
- Spaced repetition across days (SM-2, Anki-style): 1 → 3 → 8 → 20 → 50 → 125 days.
- 20 new cards per day by default (Anki default) with a visible daily counter.
- Session score: +1 first-try correct, −1 first miss, +1 when you clear a missed card.
- ~120 short messages react to the score — because a counter alone is not a coach.
- History of correct / wrong cards with answers always visible.

Progress lives in your browser (localStorage). Install the app to your home screen
as a PWA and use Settings → Export to back it up.

## Content

Every card in `cards/` is a JSON record with code, expected answer and explanation.
`tools/verify_cards.py` executes every executable snippet on Python 3.12 (three runs
with different `PYTHONHASHSEED`) and rejects cards whose answer does not match or
whose output is nondeterministic. Cards that cannot be executed (network, browser)
are marked `manual` and reviewed by hand.

## Development

```bash
npm install
npm run dev          # local dev server
npm test             # vitest (domain logic)
npm run build        # production build
python3 tools/verify_cards.py   # validate all cards
```

Deployed to GitHub Pages from `main` by GitHub Actions.

See [PLAN.md](PLAN.md) (in Russian) for the full design and roadmap.

## License

MIT
