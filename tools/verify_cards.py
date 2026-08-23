#!/usr/bin/env python3
"""Validate the card bank: schema, limits, and — for executable cards — the answers.

Every `verify: exec` card is run three times with different PYTHONHASHSEED values on
the given Python (3.12 by default). A card fails if the program's behaviour does not
match its answer or differs between runs (nondeterministic).

Usage:
    python3 tools/verify_cards.py                 # whole bank
    python3 tools/verify_cards.py cards/block-1/002-*.json
    python3 tools/verify_cards.py --python python3.12 --jobs 8
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS_DIR = ROOT / "cards"

KINDS = {"output", "exception", "value", "pytest", "truth"}
VERIFY_MODES = {"exec", "pytest", "manual"}
MAX_LINES, MAX_COLS = 12, 44
MAX_ANSWER, MAX_QUESTION, MAX_EXPLANATION = 60, 80, 320
HASH_SEEDS = ("0", "1", "2")
TIMEOUT = 5
ID_RE = re.compile(r"^b(\d)-(\d{3})-(\d{2})$")
EXC_NAME_RE = re.compile(r"^[A-Z][A-Za-z0-9]*$")


@dataclass
class Problem:
    card_id: str
    file: str
    message: str


@dataclass
class Stats:
    cards: int = 0
    exec: int = 0
    pytest: int = 0
    manual: int = 0
    problems: list[Problem] = field(default_factory=list)


# ----------------------------------------------------------------------------- schema

def check_schema(card: dict, file: Path, topic: int, seen_ids: set, seen_code: dict) -> list[str]:
    errs: list[str] = []
    cid = card.get("id", "<no id>")

    m = ID_RE.match(str(cid))
    if not m:
        errs.append(f"id must match b<block>-<topic:03d>-<nn:02d>, got {cid!r}")
    else:
        if int(m.group(2)) != topic:
            errs.append(f"id topic {m.group(2)} does not match file topic {topic}")
        if cid in seen_ids:
            errs.append("duplicate id")
        seen_ids.add(cid)

    for key in ("kind", "question", "code", "answer", "explanation", "verify"):
        if key not in card:
            errs.append(f"missing field {key!r}")
    if errs:
        return errs

    if card["kind"] not in KINDS:
        errs.append(f"unknown kind {card['kind']!r}")
    if card["verify"] not in VERIFY_MODES:
        errs.append(f"unknown verify mode {card['verify']!r}")
    if not isinstance(card.get("accepted", []), list):
        errs.append("accepted must be a list")
    if not isinstance(card.get("tags", []), list):
        errs.append("tags must be a list")

    code: str = card["code"]
    lines = code.split("\n")
    if len(lines) > MAX_LINES:
        errs.append(f"code has {len(lines)} lines (max {MAX_LINES})")
    for i, line in enumerate(lines, 1):
        if len(line) > MAX_COLS:
            errs.append(f"code line {i} is {len(line)} chars (max {MAX_COLS})")
        if "\t" in line:
            errs.append(f"code line {i} contains a tab")
        if line != line.rstrip():
            errs.append(f"code line {i} has trailing whitespace")
    if not code.strip():
        errs.append("code is empty")
    norm_code = "\n".join(l.strip() for l in lines if l.strip())
    if norm_code in seen_code:
        errs.append(f"duplicate code (same as {seen_code[norm_code]})")
    else:
        seen_code[norm_code] = cid

    answer: str = card["answer"]
    if not isinstance(answer, str) or not answer.strip():
        errs.append("answer must be a non-empty string")
    else:
        if len(answer) > MAX_ANSWER:
            errs.append(f"answer is {len(answer)} chars (max {MAX_ANSWER})")
        if card["kind"] != "output" and "\n" in answer:
            errs.append("only output cards may have multi-line answers")
        if answer.count("\n") > 2:
            errs.append("answer has more than 3 lines")
        if card["kind"] == "exception" and answer != "no error" and not EXC_NAME_RE.match(answer):
            errs.append(f"exception answer must be a class name or 'no error', got {answer!r}")
        if card["kind"] == "truth" and answer not in ("True", "False"):
            errs.append("truth answer must be 'True' or 'False'")
    if len(card["question"]) > MAX_QUESTION:
        errs.append(f"question is {len(card['question'])} chars (max {MAX_QUESTION})")
    if len(card["explanation"]) > MAX_EXPLANATION:
        errs.append(f"explanation is {len(card['explanation'])} chars (max {MAX_EXPLANATION})")
    if card["verify"] == "pytest" and card["kind"] != "pytest":
        errs.append("verify=pytest requires kind=pytest")
    if card["kind"] == "pytest" and card["verify"] == "exec":
        errs.append("pytest cards must use verify=pytest")
    return errs


# ----------------------------------------------------------------------------- exec

def run_python(python: str, code: str, seed: str, extra_args: list[str] | None = None) -> tuple[int, str, str]:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "snippet.py"
        path.write_text(code + "\n", encoding="utf-8")
        env = {
            "PATH": os.environ.get("PATH", ""),
            "PYTHONHASHSEED": seed,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONDONTWRITEBYTECODE": "1",
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "HOME": tmp,
        }
        try:
            proc = subprocess.run(
                [python, "-B", "-s", *(extra_args or []), str(path)],
                cwd=tmp, env=env, capture_output=True, text=True,
                timeout=TIMEOUT, stdin=subprocess.DEVNULL,
            )
        except subprocess.TimeoutExpired:
            return 124, "", "TIMEOUT"
        return proc.returncode, proc.stdout, proc.stderr


def run_pytest(python: str, code: str, seed: str) -> tuple[int, str, str]:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "test_card.py"
        path.write_text(code + "\n", encoding="utf-8")
        env = {
            "PATH": os.environ.get("PATH", ""),
            "PYTHONHASHSEED": seed,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONDONTWRITEBYTECODE": "1",
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "HOME": os.environ.get("HOME", tmp),  # user site-packages (pytest) live under HOME
        }
        try:
            proc = subprocess.run(
                [python, "-B", "-m", "pytest", "-q", "-p", "no:cacheprovider",  # no -s: pytest may live in user site
                 "--no-header", "-o", "addopts=", str(path)],
                cwd=tmp, env=env, capture_output=True, text=True,
                timeout=TIMEOUT * 4, stdin=subprocess.DEVNULL,
            )
        except subprocess.TimeoutExpired:
            return 124, "", "TIMEOUT"
        return proc.returncode, proc.stdout, proc.stderr


def last_exception_name(stderr: str) -> str | None:
    """Name of the exception in the final traceback line, e.g. 'ValueError'."""
    for line in reversed(stderr.strip().splitlines()):
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^([A-Za-z_][\w.]*?)(?::.*)?$", line)
        if m:
            return m.group(1).split(".")[-1]
        return None
    return None


def normalize_output(text: str) -> str:
    return "\n".join(l.rstrip() for l in text.rstrip("\n").splitlines())


def pytest_summary(stdout: str) -> str | None:
    """'2 passed, 1 failed in 0.03s' -> '1 failed, 2 passed' (sorted, time stripped)."""
    for line in reversed(stdout.strip().splitlines()):
        m = re.search(r"(\d+ \w+(?:, \d+ \w+)*) in [\d.]+s", line)
        if m:
            parts = [p.strip() for p in m.group(1).split(",")]
            return ", ".join(sorted(parts))
    return None


def expected_pytest(answer: str) -> str:
    parts = [p.strip() for p in answer.split(",")]
    return ", ".join(sorted(parts))


def verify_exec(python: str, card: dict) -> str | None:
    """Return an error message, or None if the card checks out."""
    kind, code, answer = card["kind"], card["code"], card["answer"]

    if kind in ("value", "truth"):
        lines = code.rstrip("\n").split("\n")
        last = lines[-1]
        if not last or last[0].isspace():
            return "value/truth cards must end with a top-level expression"
        program = "\n".join(lines[:-1]) + f"\n__pycards_result = ({last})\nprint(repr(__pycards_result))"
    else:
        program = code

    results = []
    for seed in HASH_SEEDS:
        results.append(run_python(python, program, seed))
    if len({(rc, out, last_exception_name(err)) for rc, out, err in results}) > 1:
        return "nondeterministic: output differs between runs with different PYTHONHASHSEED"

    rc, out, err = results[0]
    if err.strip() == "TIMEOUT":
        return f"timed out after {TIMEOUT}s"

    if kind in ("output", "value", "truth"):
        if rc != 0:
            exc = last_exception_name(err) or "unknown error"
            return f"program crashed with {exc}: {err.strip().splitlines()[-1] if err.strip() else ''}"
        got = normalize_output(out)
        want = normalize_output(answer)
        if got != want:
            return f"expected {want!r}, got {got!r}"
        return None

    if kind == "exception":
        if answer == "no error":
            if rc != 0:
                return f"expected no error, but crashed with {last_exception_name(err)}"
            return None
        if rc == 0:
            return f"expected {answer}, but the program ran fine (stdout={normalize_output(out)!r})"
        got = last_exception_name(err)
        if got != answer:
            return f"expected {answer}, got {got}"
        return None

    return f"kind {kind!r} cannot be verified with exec"


def verify_pytest(python: str, card: dict) -> str | None:
    answer = card["answer"].strip()
    rc, out, err = run_pytest(python, card["code"], "0")
    if err.strip() == "TIMEOUT":
        return "pytest timed out"
    if "No module named pytest" in err:
        return "pytest is not installed for the verifier interpreter"
    if answer.isdigit():
        # number of tests = sum of all outcome counters in the summary line
        outcomes = re.findall(r"(\d+) (?:passed|failed|skipped|xfailed|xpassed|errors?)", out)
        got = sum(int(n) for n in outcomes)
        if not outcomes:
            tail = (out.strip().splitlines() or [""])[-1]
            return f"could not count tests; last line: {tail!r}"
        if got != int(answer):
            return f"expected {answer} tests, got {got}"
        return None
    got = pytest_summary(out)
    if got is None:
        tail = (out.strip().splitlines() or [""])[-1]
        return f"no pytest summary found; last line: {tail!r}; stderr: {err.strip()[:200]!r}"
    if got != expected_pytest(answer):
        return f"expected {expected_pytest(answer)!r}, got {got!r}"
    return None


# ----------------------------------------------------------------------------- main

def load_files(patterns: list[str]) -> list[Path]:
    if not patterns:
        return sorted(CARDS_DIR.glob("block-*/*.json"))
    files: list[Path] = []
    for p in patterns:
        files.extend(Path(x) for x in glob.glob(p))
    return sorted(set(files))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*", help="card files (default: whole bank)")
    ap.add_argument("--python", default=os.environ.get("PYCARDS_PYTHON", "python3"), help="interpreter to run snippets with")
    ap.add_argument("--jobs", type=int, default=max(2, (os.cpu_count() or 4) - 1))
    ap.add_argument("--schema-only", action="store_true", help="skip executing snippets")
    args = ap.parse_args()

    try:
        ver = subprocess.run([args.python, "--version"], capture_output=True, text=True).stdout.strip()
    except FileNotFoundError:
        print(f"interpreter not found: {args.python}", file=sys.stderr)
        return 2

    files = load_files(args.files)
    if not files:
        print("verify_cards: no card files found")
        return 0

    topics = {t["n"]: t for t in json.loads((CARDS_DIR / "topics.json").read_text())["topics"]}
    stats = Stats()
    seen_ids: set = set()
    seen_code: dict = {}
    jobs: list[tuple[dict, Path]] = []

    for file in files:
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            stats.problems.append(Problem("<file>", str(file), f"invalid JSON: {e}"))
            continue
        topic = data.get("topic")
        if topic not in topics:
            stats.problems.append(Problem("<file>", str(file), f"unknown topic {topic!r}"))
            continue
        expected_block = topics[topic]["block"]
        if file.parent.name != f"block-{expected_block}":
            stats.problems.append(Problem("<file>", str(file), f"topic {topic} belongs to block-{expected_block}"))
        if not file.name.startswith(f"{topic:03d}-"):
            stats.problems.append(Problem("<file>", str(file), f"file name must start with {topic:03d}-"))
        for card in data.get("cards", []):
            stats.cards += 1
            errs = check_schema(card, file, topic, seen_ids, seen_code)
            if errs:
                for e in errs:
                    stats.problems.append(Problem(card.get("id", "<no id>"), str(file), e))
                continue
            mode = card["verify"]
            if mode == "manual":
                stats.manual += 1
            elif mode == "exec":
                stats.exec += 1
                jobs.append((card, file))
            elif mode == "pytest":
                stats.pytest += 1
                jobs.append((card, file))

    if not args.schema_only and jobs:
        def work(job):
            card, file = job
            fn = verify_pytest if card["verify"] == "pytest" else verify_exec
            try:
                msg = fn(args.python, card)
            except Exception as e:  # noqa: BLE001
                msg = f"verifier error: {e!r}"
            return (card["id"], str(file), msg)

        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            for cid, file, msg in pool.map(work, jobs):
                if msg:
                    stats.problems.append(Problem(cid, file, msg))

    rel = lambda f: os.path.relpath(f, ROOT)
    for p in stats.problems:
        print(f"FAIL {p.card_id} ({rel(p.file)}): {p.message}")
    print(
        f"verify_cards: {stats.cards} cards in {len(files)} files — "
        f"{stats.exec} exec, {stats.pytest} pytest, {stats.manual} manual; "
        f"{len(stats.problems)} problem(s); interpreter {ver}"
    )
    return 1 if stats.problems else 0


if __name__ == "__main__":
    sys.exit(main())
