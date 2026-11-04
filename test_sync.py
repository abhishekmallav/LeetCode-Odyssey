import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sync


class CompanySyncTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.master = self.root / "leetcode_problems.csv"
        self.master.write_text(
            "\ufeffProblem No, Title  , Difficulty, Topics\n"
            ' 1, Two Sum  , Easy, "Array, Hash Table"\n'
            " 2, Add Two Numbers , Medium, Linked List\n",
            encoding="utf-8",
        )
        self.source(
            "liquidslr",
            "Google",
            "1. Thirty Days.csv",
            [
                [
                    "Difficulty",
                    "Title",
                    "Frequency",
                    "Acceptance Rate",
                    "Link",
                    "Topics",
                ],
                [
                    "EASY",
                    "Two Sum",
                    "100",
                    "50",
                    "https://leetcode.com/problems/two-sum/",
                    "Array",
                ],
            ],
        )
        self.source(
            "snehasishroy",
            "google",
            "all.csv",
            [
                ["ID", "URL", "Title", "Difficulty", "Acceptance %", "Frequency %"],
                [
                    "1",
                    "https://leetcode.com/problems/two-sum",
                    "Two Sum",
                    "Easy",
                    "50",
                    "100",
                ],
                [
                    "99",
                    "https://leetcode.com/problems/source-only",
                    "Source Only",
                    "Hard",
                    "50",
                    "100",
                ],
            ],
        )
        self.latest = patch(
            "sync.latest_commit", return_value="a" * 40
        ).start()
        self.checkout = patch("sync.update_checkout").start()
        self.addCleanup(patch.stopall)

    def source(self, repository, company, filename, rows):
        path = self.root / ".company-sources" / repository / company / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", newline="", encoding="utf-8") as file:
            csv.writer(file).writerows(rows)
        return path

    def read(self, path):
        with path.open(encoding="utf-8-sig", newline="") as file:
            return list(csv.DictReader(file))

    def test_union_ranges_cleaning_and_unmatched_questions(self):
        self.assertTrue(sync.sync(self.root))
        google = self.read(self.root / "companies" / "Google.csv")
        self.assertEqual(list(google[0])[:3], ["Problem No", "Link", "Title"])
        self.assertEqual(len(google), 2)
        self.assertEqual(
            google[0],
            {
                "Problem No": "1",
                "Link": "https://leetcode.com/problems/two-sum/description/",
                "Title": "Two Sum",
                "Difficulty": "Easy",
                "Topics": "Array, Hash Table",
                "range": "last 30 days; all time",
            },
        )
        self.assertEqual(google[1]["Problem No"], "99")
        master = self.read(self.master)
        self.assertEqual(list(master[0])[:3], ["Problem No", "Link", "Title"])
        self.assertEqual(master[1]["Link"], "https://leetcode.com/problems/add-two-numbers/description/")
        self.assertEqual([row["company"] for row in master], ["Google", ""])
        self.assertEqual(len(master), 2)
        self.assertEqual(
            json.loads((self.root / "sync.json").read_text())["company_count"], 1
        )

    def test_no_new_commits_skips_processing_and_writes(self):
        sync.sync(self.root)
        files = [
            self.master,
            self.root / "sync.json",
            self.root / "companies" / "Google.csv",
        ]
        before = [(p.read_bytes(), p.stat().st_mtime_ns) for p in files]
        self.checkout.reset_mock()
        with patch("sync.collect_companies") as collect:
            self.assertFalse(sync.sync(self.root))
            collect.assert_not_called()
        self.checkout.assert_not_called()
        self.assertEqual(
            before, [(p.read_bytes(), p.stat().st_mtime_ns) for p in files]
        )

    def test_one_changed_repo_rebuilds_union_and_removes_stale_files(self):
        sync.sync(self.root)
        self.latest.side_effect = ["b" * 40, "a" * 40]
        path = (
            self.root
            / ".company-sources"
            / "liquidslr"
            / "Google"
            / "1. Thirty Days.csv"
        )
        path.rename(path.with_name("2. Three Months.csv"))
        stale = self.root / "companies" / "Removed Company.csv"
        stale.write_text("old output")
        self.assertTrue(sync.sync(self.root))
        self.assertFalse(stale.exists())
        self.assertEqual(
            self.read(self.root / "companies" / "Google.csv")[0]["range"],
            "last 3 months; all time",
        )
        state = json.loads((self.root / "sync.json").read_text())
        self.assertEqual(state["repositories"]["liquidslr"]["commit"], "b" * 40)

    def test_failure_preserves_outputs_and_saved_commits(self):
        sync.sync(self.root)
        config = self.root / "sync.json"
        before = (config.read_bytes(), self.master.read_bytes())
        self.latest.return_value = "b" * 40
        self.source("liquidslr", "Google", "unknown-range.csv", [["Title"]])
        with self.assertRaisesRegex(ValueError, "Unknown time range"):
            sync.sync(self.root)
        self.assertEqual(before, (config.read_bytes(), self.master.read_bytes()))

    def test_aliases_multiple_companies_and_empty_company(self):
        header = ["Difficulty", "Title", "Link"]
        self.source(
            "liquidslr",
            "J.P. Morgan",
            "5. All.csv",
            [header, ["EASY", "Two Sum", "https://leetcode.com/problems/two-sum"]],
        )
        self.source("liquidslr", "Empty Company", "5. All.csv", [header])
        self.source(
            "snehasishroy",
            "jpmorgan",
            "all.csv",
            [
                ["ID", "URL", "Title", "Difficulty"],
                ["1", "https://leetcode.com/problems/two-sum", "Two Sum", "Easy"],
            ],
        )
        self.source(
            "snehasishroy",
            "citi",
            "all.csv",
            [
                ["ID", "URL", "Title", "Difficulty"],
                ["1", "https://leetcode.com/problems/two-sum", "Two Sum", "Easy"],
            ],
        )
        sync.sync(self.root)
        self.assertEqual(
            self.read(self.master)[0]["company"], "Citigroup; Google; J.P. Morgan"
        )
        self.assertEqual(self.read(self.root / "companies" / "Empty Company.csv"), [])
        self.assertEqual(len(list((self.root / "companies").glob("*.csv"))), 4)

    def test_duplicate_master_ids_fail_before_writing(self):
        self.master.write_text(
            "Problem No,Title,Difficulty,Topics\n1,One,Easy,\n1,Two,Hard,\n"
        )
        before = self.master.read_bytes()
        with self.assertRaisesRegex(ValueError, "duplicate"):
            sync.sync(self.root)
        self.assertEqual(self.master.read_bytes(), before)
        self.assertFalse((self.root / "sync.json").exists())

    def test_git_failure_leaves_existing_data_alone(self):
        sync.sync(self.root)
        before = self.master.read_bytes()
        self.latest.side_effect = OSError("network unavailable")
        with self.assertRaises(OSError):
            sync.sync(self.root)
        self.assertEqual(before, self.master.read_bytes())

    def test_changed_master_rebuilds_even_with_same_commits(self):
        sync.sync(self.root)
        with self.master.open("a", encoding="utf-8") as file:
            csv.writer(file).writerow(["3", "", "Third Problem", "Hard", "", ""])
        self.assertTrue(sync.sync(self.root))
        self.assertEqual(len(self.read(self.master)), 3)

    def test_removed_association_is_cleared(self):
        sync.sync(self.root)
        for path in (self.root / ".company-sources").glob("*/*/*.csv"):
            header = path.read_text().splitlines()[0]
            path.write_text(header + "\n")
        self.latest.return_value = "b" * 40
        sync.sync(self.root)
        self.assertEqual(self.read(self.master)[0]["company"], "")
        self.assertEqual(self.read(self.root / "companies" / "Google.csv"), [])

    def test_missing_company_file_is_rebuilt(self):
        sync.sync(self.root)
        path = self.root / "companies" / "Google.csv"
        path.unlink()
        self.assertTrue(sync.sync(self.root))
        self.assertTrue(path.exists())


class CheckoutTests(unittest.TestCase):
    def test_clone_update_and_refuse_local_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            origin = root / "origin"
            checkout = root / "checkout"
            sync.git("init", "-q", origin)
            source = origin / "data.csv"

            def commit(value):
                source.write_text(value)
                sync.git("-C", origin, "add", "data.csv")
                sync.git(
                    "-C",
                    origin,
                    "-c",
                    "user.name=Test",
                    "-c",
                    "user.email=test@example.invalid",
                    "commit",
                    "-qm",
                    "Update data",
                )
                return sync.latest_commit(str(origin))

            first = commit("first")
            sync.update_checkout(checkout, str(origin), first)
            self.assertEqual((checkout / "data.csv").read_text(), "first")
            second = commit("second")
            sync.update_checkout(checkout, str(origin), second)
            self.assertEqual((checkout / "data.csv").read_text(), "second")
            self.assertEqual(sync.git("-C", checkout, "rev-parse", "HEAD"), second)
            (checkout / "data.csv").write_text("local edit")
            with self.assertRaisesRegex(ValueError, "local edits"):
                sync.update_checkout(checkout, str(origin), second)
            self.assertEqual((checkout / "data.csv").read_text(), "local edit")


if __name__ == "__main__":
    unittest.main()
