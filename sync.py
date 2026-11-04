#!/usr/bin/env python3
"""Merge company question snapshots and skip work when upstream commits are unchanged."""

import argparse
import csv
import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

from leetcode import problem_link

ROOT = Path(__file__).resolve().parent
REPOSITORIES = {
    "liquidslr": "https://github.com/liquidslr/leetcode-company-wise-problems.git",
    "snehasishroy": "https://github.com/snehasishroy/leetcode-companywise-interview-questions.git",
}
FIELDS = ["Problem No", "Link", "Title", "Difficulty", "Topics"]
RANGES = {
    "thirtydays": "last 30 days",
    "threemonths": "last 3 months",
    "sixmonths": "last 6 months",
    "morethansixmonths": "more than 6 months",
    "all": "all time",
}
# Explicit source-name aliases; similar spellings alone do not identify a company.
ALIASES = {
    "airbus": "Airbus SE",
    "billcom": "BILL Holdings",
    "citi": "Citigroup",
    "cruiseautomation": "Cruise",
    "edelweiss": "Edelweiss Group",
    "hrt": "Hudson River Trading",
    "lendingkart": "Lendingkart Technologies",
    "lowe": "Lowe's",
    "nationalpaymentscoorperationindia": "National Payments Corporation of India",
    "ola": "Ola Cabs",
    "palantir": "Palantir Technologies",
    "snapchat": "Snap",
    "towerresearch": "Tower Research Capital",
    "veeva": "Veeva Systems",
    "virtu": "Virtu Financial",
    "wissen": "Wissen Technology",
    "twitter": "X",
}


def key(value):
    return "".join(
        c for c in unicodedata.normalize("NFKC", value).casefold() if c.isalnum()
    )


def read_csv(path, required):
    with path.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file, skipinitialspace=True)
        fields = [field.strip() for field in reader.fieldnames or []]
        if len(fields) != len(set(fields)) or not set(required) <= set(fields):
            raise ValueError(f"{path}: expected columns {required}, found {fields}")
        reader.fieldnames = fields
        rows = []
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"{path}:{reader.line_num}: malformed CSV row")
            rows.append({name: value.strip() for name, value in row.items()})
    return fields, rows


def git(*args):
    return subprocess.run(
        ["git", *map(str, args)],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout.strip()


def latest_commit(url):
    result = git("ls-remote", url, "HEAD").split()
    if not result or not re.fullmatch(r"[0-9a-f]{40}", result[0]):
        raise ValueError(f"Could not determine latest commit for {url}")
    return result[0]


def update_checkout(path, url, commit):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        git("clone", "--depth", "1", url, path)
    if git("-C", path, "remote", "get-url", "origin") != url:
        raise ValueError(f"{path}: origin differs from configured repository")
    if git("-C", path, "status", "--porcelain"):
        raise ValueError(
            f"{path}: source checkout has local edits; refusing to overwrite"
        )
    if git("-C", path, "rev-parse", "HEAD") != commit:
        git("-C", path, "fetch", "--depth", "1", "origin", commit)
        git("-C", path, "checkout", "--detach", commit)


def collect_companies(source_root, catalog):
    by_id = {}
    by_title = {}
    for row in catalog:
        number = row["Problem No"]
        title = key(row["Title"])
        if not number or not title or number in by_id or title in by_title:
            raise ValueError(
                f"Main CSV has a blank or duplicate problem number/title: {number}"
            )
        by_id[number] = row
        by_title[title] = row

    names = {}
    records = []
    problems = {}
    for source in REPOSITORIES:
        paths = sorted((source_root / source).glob("*/*.csv"))
        if not paths:
            raise ValueError(f"No company CSVs found in {source}")
        for path in paths:
            range_key = key(re.sub(r"^\d+\.\s*", "", path.stem))
            if range_key not in RANGES:
                raise ValueError(f"Unknown time range: {path}")
            raw_name = path.parent.name
            company_key = key(ALIASES.get(key(raw_name), raw_name))
            names.setdefault(
                company_key,
                ALIASES.get(
                    key(raw_name),
                    raw_name
                    if source == "liquidslr"
                    else raw_name.replace("-", " ").title(),
                ),
            )
            required = (
                ["Title", "Difficulty", "Link"]
                if source == "liquidslr"
                else ["ID", "URL", "Title", "Difficulty"]
            )
            _, rows = read_csv(path, required)
            for row in rows:
                url = urlparse(row.get("Link", row.get("URL", "")))
                match = re.fullmatch(r"/problems/([^/]+)/?", url.path)
                difficulty = row["Difficulty"].title()
                if (
                    url.hostname not in {"leetcode.com", "www.leetcode.com"}
                    or not match
                ):
                    raise ValueError(f"{path}: invalid problem URL")
                if not row["Title"] or difficulty not in {"Easy", "Medium", "Hard"}:
                    raise ValueError(f"{path}: invalid question metadata")
                slug = match[1]
                number = row.get("ID", "")
                known = by_id.get(number) or by_title.get(key(row["Title"]))
                if known:
                    if number and number != known["Problem No"]:
                        raise ValueError(
                            f"{path}: problem ID/title mismatch for {row['Title']}"
                        )
                    number = known["Problem No"]
                problem = problems.setdefault(
                    slug,
                    {
                        "Problem No": "",
                        "Link": problem_link(row["Title"], slug),
                        "Title": row["Title"],
                        "Difficulty": difficulty,
                        "Topics": "",
                    },
                )
                if number:
                    if problem["Problem No"] and problem["Problem No"] != number:
                        raise ValueError(f"Conflicting problem IDs for {slug}")
                    problem["Problem No"] = number
                if known:
                    known["Link"] = problem["Link"]
                    problem.update({field: known[field] for field in FIELDS})
                if not problem["Topics"]:
                    problem["Topics"] = row.get("Topics", "")
                records.append((company_key, slug, RANGES[range_key]))

    companies = {name: {} for name in names.values()}
    associations = defaultdict(set)
    for company_key, slug, time_range in records:
        problem = problems[slug]
        identity = problem["Problem No"] or slug
        entry = companies[names[company_key]].setdefault(
            identity, {**problem, "ranges": set()}
        )
        entry["ranges"].add(time_range)
        if problem["Problem No"]:
            associations[problem["Problem No"]].add(names[company_key])
    unknown = sum(not problem["Problem No"] for problem in problems.values())
    if unknown:
        print(
            f"Warning: {unknown} source problems have no known number; retained with a blank Problem No.",
            flush=True,
        )
    return companies, associations


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync(root=ROOT, force=False):
    config_path = root / "sync.json"
    config = (
        json.loads(config_path.read_text(encoding="utf-8"))
        if config_path.exists()
        else {}
    )
    master = root / "leetcode_problems.csv"
    repositories = config.get(
        "repositories", {name: {"url": url} for name, url in REPOSITORIES.items()}
    )
    if set(repositories) != set(REPOSITORIES):
        raise ValueError("Config must contain both source repositories")
    current = {}
    for name, repository in repositories.items():
        commit = latest_commit(repository["url"])
        current[name] = {"url": repository["url"], "commit": commit}
        print(f"{name}: {commit}", flush=True)
    companies_dir = root / "companies"
    if (
        not force
        and current == repositories
        and config.get("catalog_sha256") == file_hash(master)
        and config.get("company_count", 0) > 0
        and len(list(companies_dir.glob("*.csv"))) == config["company_count"]
    ):
        print(
            "No new commits. Company data is up to date; skipping rebuild.", flush=True
        )
        return False
    fields, catalog = read_csv(master, [field for field in FIELDS if field != "Link"])
    fields = [field for field in fields if field != "Link"]
    fields.insert(fields.index("Problem No") + 1, "Link")
    for row in catalog:
        row["Link"] = problem_link(row["Title"])
    for name, repository in current.items():
        update_checkout(
            root / ".company-sources" / name, repository["url"], repository["commit"]
        )
    companies, associations = collect_companies(root / ".company-sources", catalog)
    for row in catalog:
        row["company"] = "; ".join(
            sorted(associations.get(row["Problem No"], ()), key=str.casefold)
        )
    if "company" not in fields:
        fields.append("company")
    with tempfile.TemporaryDirectory(prefix=".company-sync-", dir=root) as directory:
        staging = Path(directory)
        filenames = set()
        for company, entries in sorted(companies.items()):
            filename = re.sub(r'[<>:"/\\|?*]', "_", company).rstrip(". ") + ".csv"
            if filename.casefold() in {name.casefold() for name in filenames}:
                raise ValueError(f"Company filename collision: {company}")
            filenames.add(filename)
            rows = []
            for row in sorted(
                entries.values(),
                key=lambda r: (
                    (0, int(r["Problem No"]))
                    if r["Problem No"].isdigit()
                    else (1, r["Title"])
                ),
            ):
                rows.append(
                    {
                        **{field: row[field] for field in FIELDS},
                        "range": "; ".join(
                            r for r in RANGES.values() if r in row["ranges"]
                        ),
                    }
                )
            write_csv(staging / filename, FIELDS + ["range"], rows)
        staged_master = staging / "master.csv.tmp"
        write_csv(staged_master, fields, catalog)
        state = {
            "repositories": current,
            "catalog_sha256": file_hash(staged_master),
            "company_count": len(companies),
        }
        staged_config = staging / "config.json.tmp"
        staged_config.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
        companies_dir.mkdir(exist_ok=True)
        for filename in filenames:
            (staging / filename).replace(companies_dir / filename)
        for obsolete in companies_dir.glob("*.csv"):
            if obsolete.name not in filenames:
                obsolete.unlink()
        staged_master.replace(master)
        # Save commits last so a failed refresh is retried on the next run.
        staged_config.replace(config_path)
    matched = sum(bool(row["company"]) for row in catalog)
    print(
        f"Saved {len(companies)} company CSVs; matched {matched}/{len(catalog)} catalog questions.",
        flush=True,
    )
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild even when source commits are unchanged",
    )
    args = parser.parse_args()
    sync(force=args.force)
