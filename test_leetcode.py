import csv
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from leetcode import FIELDS, export_questions, fetch_question, graphql, problem_link


def question(number):
    return {
        "questionFrontendId": number,
        "title": f"Title, number {number}",
        "titleSlug": f"title-{number}",
        "difficulty": "Easy",
        "topicTags": [{"name": "Array"}],
    }


def index(*numbers, total=None):
    return {"total": len(numbers) if total is None else total, "questions": [
        {"questionFrontendId": number, "titleSlug": f"title-{number}"} for number in numbers
    ]}


def saved_csv(path, extra=False):
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS + (["Notes"] if extra else []))
        writer.writeheader()
        writer.writerow({"Problem No": "1", "Link": "https://leetcode.com/problems/two-sum/description/",
                         "Title": "My existing title", "Difficulty": "Hard", "Topics": "Array, Hash Table",
                         "company": "Amazon; Google", **({"Notes": "Keep my note"} if extra else {})})


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name) / "questions.csv"
        self.sleep = patch("leetcode.time.sleep").start()
        self.addCleanup(patch.stopall)

    def read(self):
        with self.output.open(encoding="utf-8-sig", newline="") as file:
            return list(csv.DictReader(file))

    def test_problem_links(self):
        for title, slug in [("First Missing Positive", "first-missing-positive"),
                            ("Combination Sum II", "combination-sum-ii"), ("Pow(x, n)", "powx-n")]:
            self.assertEqual(problem_link(title), f"https://leetcode.com/problems/{slug}/description/")
        self.assertEqual(problem_link("Renamed Title", "canonical-slug"),
                         "https://leetcode.com/problems/canonical-slug/description/")

    @patch("leetcode.fetch_question")
    @patch("leetcode.fetch_page")
    def test_pagination_for_new_catalog(self, fetch, detail):
        fetch.side_effect = [index("10", total=2), index("2", total=2)]
        detail.side_effect = [question("10"), question("2")]
        self.assertEqual(export_questions(self.output), 2)
        rows = self.read()
        self.assertEqual(list(rows[0]), FIELDS)
        self.assertEqual([row["Problem No"] for row in rows], ["2", "10"])
        self.assertEqual(rows[0]["Link"], "https://leetcode.com/problems/title-2/description/")
        self.assertEqual(rows[0]["company"], "")
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [0, 1])

    @patch("leetcode.fetch_question")
    @patch("leetcode.fetch_page", return_value=index("1", "2"))
    def test_append_only_preserves_existing_bytes_companies_and_extra_columns(self, fetch, detail):
        saved_csv(self.output, extra=True)
        original = self.output.read_bytes()
        detail.return_value = question("2")
        self.assertEqual(export_questions(self.output), 1)
        self.assertTrue(self.output.read_bytes().startswith(original))
        rows = self.read()
        self.assertEqual(rows[0]["Title"], "My existing title")
        self.assertEqual(rows[0]["Difficulty"], "Hard")
        self.assertEqual(rows[0]["company"], "Amazon; Google")
        self.assertEqual(rows[0]["Notes"], "Keep my note")
        self.assertEqual(rows[1]["company"], "")
        self.assertEqual(rows[1]["Notes"], "")
        detail.assert_called_once_with("title-2")

    @patch("leetcode.fetch_question")
    @patch("leetcode.fetch_page", return_value=index("1"))
    def test_no_new_questions_does_not_fetch_details_or_write(self, fetch, detail):
        saved_csv(self.output)
        before = (self.output.read_bytes(), self.output.stat().st_mtime_ns)
        self.assertEqual(export_questions(self.output), 0)
        detail.assert_not_called()
        self.assertEqual(before, (self.output.read_bytes(), self.output.stat().st_mtime_ns))

    @patch("leetcode.fetch_question")
    @patch("leetcode.fetch_page")
    def test_backfilled_id_is_found_even_when_remote_count_matches_local(self, fetch, detail):
        saved_csv(self.output)
        fetch.return_value = index("2")
        detail.return_value = question("2")
        export_questions(self.output)
        self.assertEqual([r["Problem No"] for r in self.read()], ["1", "2"])

    @patch("leetcode.fetch_question")
    @patch("leetcode.fetch_page")
    def test_bad_index_never_changes_existing_csv(self, fetch, detail):
        for last_page in [index(total=2), index("1", total=2), index("2", total=3)]:
            saved_csv(self.output)
            original = self.output.read_bytes()
            fetch.side_effect = [index("1", total=2), last_page]
            with self.assertRaises(RuntimeError):
                export_questions(self.output)
            self.assertEqual(self.output.read_bytes(), original)
        detail.assert_not_called()

    @patch("leetcode.fetch_page")
    def test_invalid_local_csv_fails_before_network(self, fetch):
        self.output.write_text("not a CSV")
        with self.assertRaises(ValueError):
            export_questions(self.output)
        fetch.assert_not_called()
        saved_csv(self.output)
        rows = self.output.read_bytes().splitlines(keepends=True)
        self.output.write_bytes(b"".join(rows + rows[1:]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            export_questions(self.output)
        fetch.assert_not_called()

    @patch("leetcode.fetch_question", side_effect=URLError("offline"))
    @patch("leetcode.fetch_page", return_value=index("1", "2"))
    def test_detail_failure_preserves_original(self, fetch, detail):
        saved_csv(self.output)
        original = self.output.read_bytes()
        with self.assertRaises(URLError):
            export_questions(self.output)
        self.assertEqual(self.output.read_bytes(), original)

    @patch("leetcode.fetch_question", return_value=question("99"))
    @patch("leetcode.fetch_page", return_value=index("1", "2"))
    def test_wrong_question_id_preserves_original(self, fetch, detail):
        saved_csv(self.output)
        original = self.output.read_bytes()
        with self.assertRaisesRegex(RuntimeError, "match"):
            export_questions(self.output)
        self.assertEqual(self.output.read_bytes(), original)

    @patch("leetcode.fetch_question")
    @patch("leetcode.fetch_page", return_value=index("1", "2"))
    def test_concurrent_company_edit_is_not_overwritten(self, fetch, detail):
        saved_csv(self.output)
        def edit(slug):
            self.output.write_bytes(self.output.read_bytes().replace(b"Amazon; Google", b"Meta; Nvidia"))
            return question("2")
        detail.side_effect = edit
        with self.assertRaisesRegex(RuntimeError, "changed during fetching"):
            export_questions(self.output)
        self.assertEqual(self.read()[0]["company"], "Meta; Nvidia")
        self.assertEqual(len(self.read()), 1)
        self.assertEqual(list(self.output.parent.glob("*.tmp")), [])

    @patch("leetcode.fetch_question", return_value=question("2"))
    @patch("leetcode.fetch_page", return_value=index("1", "2"))
    def test_no_trailing_newline_does_not_join_records(self, fetch, detail):
        saved_csv(self.output)
        self.output.write_bytes(self.output.read_bytes().rstrip(b"\r\n"))
        original = self.output.read_bytes()
        export_questions(self.output)
        self.assertTrue(self.output.read_bytes().startswith(original))
        self.assertEqual(len(self.read()), 2)

    @patch("leetcode.urlopen")
    def test_retry_rate_limit_and_transient_errors(self, open_url):
        response = unittest.mock.MagicMock()
        response.__enter__.return_value = io.StringIO(json.dumps({"data": {"ok": True}}))
        open_url.side_effect = [HTTPError("url", 429, "rate limit", {}, None), URLError("offline"), response]
        self.assertEqual(graphql("query", {}), {"ok": True})
        self.assertEqual([call.args[0] for call in self.sleep.call_args_list], [2, 2])
        self.assertEqual(open_url.call_count, 3)

    @patch("leetcode.urlopen", side_effect=HTTPError("url", 403, "forbidden", {}, None))
    def test_nontransient_http_error_is_not_retried(self, open_url):
        with self.assertRaises(HTTPError):
            graphql("query", {})
        self.assertEqual(open_url.call_count, 1)
        self.sleep.assert_not_called()

    @patch("leetcode.graphql", return_value={"question": question("2")})
    def test_details_query_uses_slug(self, request):
        self.assertEqual(fetch_question("title-2"), question("2"))
        self.assertEqual(request.call_args.args[1], {"titleSlug": "title-2"})


if __name__ == "__main__":
    unittest.main()
