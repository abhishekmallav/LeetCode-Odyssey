import csv
import io
import json
import re
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


FIELDS = ["Problem No", "Link", "Title", "Difficulty", "Topics", "company"]
QUERY = """
query problemsetQuestionList($limit: Int, $skip: Int) {
  problemsetQuestionList: questionList(
    categorySlug: "", limit: $limit, skip: $skip, filters: {}
  ) {
    total: totalNum
    questions: data { questionFrontendId titleSlug }
  }
}
"""
DETAIL_QUERY = """
query questionDetail($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    title
    titleSlug
    difficulty
    topicTags { name }
  }
}
"""


def problem_link(title, slug=None):
    if slug is None:
        slug = "-".join(re.sub(r"[^a-z0-9\s-]", "", title.lower()).split())
    return f"https://leetcode.com/problems/{slug}/description/"


def graphql(query, variables):
    request = Request(
        "https://leetcode.com/graphql/",
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=60) as response:
                payload = json.load(response)
            break
        except (HTTPError, URLError, TimeoutError, ConnectionError) as error:
            if isinstance(error, HTTPError) and error.code not in {429, 500, 502, 503, 504}:
                raise
            if attempt == 2:
                raise
            delay = 2 if isinstance(error, HTTPError) and error.code == 429 else 2 ** attempt
            print(f"Request failed; retrying in {delay}s.", flush=True)
            time.sleep(delay)
    if payload.get("errors") or not isinstance(payload.get("data"), dict):
        raise RuntimeError(f"LeetCode API error: {payload.get('errors', 'missing data')}")
    return payload["data"]


def fetch_page(skip):
    return graphql(QUERY, {"skip": skip, "limit": 100})["problemsetQuestionList"]


def fetch_question(slug):
    return graphql(DETAIL_QUERY, {"titleSlug": slug})["question"]


def read_existing(output):
    original = output.read_bytes() if output.exists() else b""
    if not original and not output.exists():
        return original, FIELDS.copy(), set()
    reader = csv.DictReader(io.StringIO(original.decode("utf-8-sig"), newline=""), skipinitialspace=True)
    fields = [field.strip() for field in reader.fieldnames or []]
    if len(fields) != len(set(fields)) or not set(FIELDS) <= set(fields):
        raise ValueError(f"{output}: expected columns {FIELDS}, found {fields}")
    reader.fieldnames = fields
    seen = set()
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f"{output}:{reader.line_num}: malformed CSV row")
        number = row["Problem No"].strip()
        if not number or number in seen:
            raise ValueError(f"{output}:{reader.line_num}: blank or duplicate problem number")
        if not row["Title"].strip() or row["Difficulty"].strip() not in {"Easy", "Medium", "Hard"}:
            raise ValueError(f"{output}:{reader.line_num}: invalid question metadata")
        seen.add(number)
    return original, fields, seen


def export_questions(output=Path(__file__).with_name("leetcode_problems.csv")):
    output = Path(output)
    original, fields, existing_ids = read_existing(output)
    existed = output.exists()
    seen = set()
    missing = []
    total = None
    while total is None or len(seen) < total:
        page = fetch_page(len(seen))
        if not isinstance(page, dict) or not isinstance(page.get("total"), int) or page["total"] < 0:
            raise RuntimeError("LeetCode returned an invalid catalog total.")
        if total is not None and page["total"] != total:
            raise RuntimeError("Question count changed during export; please rerun.")
        total = page["total"]
        entries = page.get("questions")
        if not isinstance(entries, list) or (not entries and total):
            raise RuntimeError("LeetCode returned an incomplete question index.")
        for entry in entries:
            if not isinstance(entry, dict):
                raise RuntimeError("LeetCode returned a malformed question index entry.")
            number = entry.get("questionFrontendId")
            slug = entry.get("titleSlug")
            if not isinstance(number, str) or not number.strip() or number != number.strip() or number in seen:
                raise RuntimeError("LeetCode returned a blank or duplicate problem number.")
            if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9-]+", slug):
                raise RuntimeError(f"Invalid question slug for {number}.")
            seen.add(number)
            if number not in existing_ids:
                missing.append(entry)
        if len(seen) > total:
            raise RuntimeError("Question index exceeds LeetCode's total.")
        print(f"Checked {len(seen)}/{total} problem IDs; {len(missing)} missing locally.", flush=True)
        if len(seen) < total:
            time.sleep(1)
    if not missing:
        print(f"No new problems. Left {output.name} unchanged.")
        return 0

    additions = []
    for entry in missing:
        time.sleep(1)
        question = fetch_question(entry["titleSlug"])
        if not isinstance(question, dict) or question.get("questionFrontendId") != entry["questionFrontendId"]:
            raise RuntimeError("Question details do not match the requested problem ID.")
        if not isinstance(question.get("title"), str) or not question["title"].strip() or question.get("difficulty") not in {"Easy", "Medium", "Hard"}:
            raise RuntimeError(f"Invalid question details for {entry['questionFrontendId']}.")
        tags = question.get("topicTags", [])
        if not isinstance(tags, list) or any(not isinstance(tag, dict) or not isinstance(tag.get("name"), str) for tag in tags):
            raise RuntimeError(f"Invalid topics for {entry['questionFrontendId']}.")
        additions.append({
            "Problem No": entry["questionFrontendId"],
            "Link": problem_link(question["title"], entry["titleSlug"]),
            "Title": question["title"],
            "Difficulty": question["difficulty"],
            "Topics": ", ".join(tag["name"] for tag in tags),
            "company": "",
        })
        print(f"Fetched new problem {entry['questionFrontendId']}: {question['title']}", flush=True)
    additions.sort(key=lambda row: (0, int(row["Problem No"])) if row["Problem No"].isdigit() else (1, row["Problem No"]))
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, restval="")
    if not existed:
        writer.writeheader()
    writer.writerows(additions)
    separator = b"\n" if original and original[-1:] not in {b"\n", b"\r"} else b""
    appended = buffer.getvalue().encode("utf-8" if existed else "utf-8-sig")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, prefix=f".{output.name}.", suffix=".tmp", delete=False) as file:
            temporary = Path(file.name)
            file.write(original + separator + appended)
        # A company sync or manual edit made during fetching must not be lost.
        if output.exists() != existed or (existed and output.read_bytes() != original):
            raise RuntimeError("The CSV changed during fetching; please rerun to preserve those edits.")
        temporary.replace(output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    print(f"Added {len(additions)} problems; preserved {len(existing_ids)} existing rows and company data.")
    return len(additions)


if __name__ == "__main__":
    export_questions()
