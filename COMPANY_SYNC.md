# Refresh company question lists

Run from this directory with Python 3 and Git installed. Network access to GitHub is required; no Python packages or LeetCode login are needed.

```bash
python3 sync.py
```

The script checks the default-branch HEAD commit of both sources:

- [liquidslr/leetcode-company-wise-problems](https://github.com/liquidslr/leetcode-company-wise-problems)
- [snehasishroy/leetcode-companywise-interview-questions](https://github.com/snehasishroy/leetcode-companywise-interview-questions)

It clones them into `.company-sources/` on the first run. Later runs fetch changed commits. Local edits in a source checkout cause an error rather than being overwritten.

[sync.json](./sync.json) records the last successfully processed commit for each repository. If both commits and the main CSV are unchanged, and the expected number of company CSVs exists, the script exits without fetching repository contents, processing source CSVs, or rewriting outputs. The remote commit checks still require network access.

If either repository changes, the script rebuilds the union of both sources. A changed main CSV or missing company CSV also triggers a rebuild. To rebuild after changing the cleaning rules or manually editing company outputs:

```bash
python3 sync.py --force
```

## Output

[companies/](./companies/) contains one CSV per company:

```text
Problem No,Link,Title,Difficulty,Topics,range
```

Company-name casing, spacing and punctuation are normalized for matching. Explicit aliases in [sync.py](./sync.py) handle additional source-name differences. Other similar-looking names remain separate. Company names from the first repository supply display names where available.

Problems are matched by source ID, shared problem URL, or normalized catalog title. Catalog metadata supplies the displayed number, title, difficulty and topics where available. For a source-only problem, source metadata is retained; unknown topics or problem numbers are left blank rather than invented. Output rows are sorted by problem number.

`Link` follows `Problem No` in both the main CSV and company CSVs, using `https://leetcode.com/problems/<slug>/description/`. Existing source URLs supply canonical slugs where available. Other titles are lowercased, punctuation is removed, and whitespace is replaced by hyphens. The LeetCode exporter uses the API's `titleSlug` when available.

All source ranges are combined into one row per problem per company. The `range` cell lists every applicable label, separated by semicolons:

- `last 30 days`
- `last 3 months`
- `last 6 months`
- `more than 6 months`
- `all time`

These ranges refer to each repository's snapshot date. Combining snapshots preserves their historical reports; it does not recalculate a rolling window from today's date. The first repository currently has 470 company folders with five CSVs each; the second has 656 company folders with varying range availability. Both include header-only lists. A company with no source questions gets a header-only output CSV.

[leetcode_problems.csv](./leetcode_problems.csv) keeps its existing question rows and order, with whitespace cleaned and a `company` column added. Multiple company names are separated by `; `; unmatched questions have a blank cell. Rebuilding replaces earlier associations, so removed upstream associations disappear unless the other source still contains them. Main-catalog questions are never removed just because they have no company match.

The script manages every CSV in `companies/`, including deleting obsolete company CSVs. Keep manually maintained CSVs elsewhere. Outputs are staged before publishing, and commits are recorded only after publishing succeeds. If publication is interrupted, rerun with `--force`.

The cloned repositories and temporary files are ignored by [.gitignore](./.gitignore). Keep the generated company CSVs, main CSV, script and config together when saving this project.

## Checks

```bash
python3 -B -m unittest -v test_sync.py test_leetcode.py
```

Tests use local fixtures and a temporary local Git repository; they do not call GitHub.
