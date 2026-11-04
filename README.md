# LeetCode Odyssey by Abhishek :)

A searchable LeetCode library on a curved 3D bookshelf, inspired by [Interesting Reads by AevyTV](https://interesting-reads.vercel.app/).

## Run locally

Use Node.js 24 or newer.

```bash
npm ci
npm run dev
```

Open the Local URL printed by Vite. The source catalog is [leetcode_problems.csv](./leetcode_problems.csv). Both development and production builds convert it into static frontend data automatically. No LeetCode login, API key, database, or browser-time scraping is needed.

## Browse

- Search by problem number (`41` or `#41`) or title.
- Combine difficulty, topic, and company filters. Popular companies have shortcuts; the company dropdown searches all companies with matching questions.
- A single shelf moves left to right along a subtle curve. Taller books turn as they travel, with textured front/back covers, page edges, highlights, shadows and short solid spacers. The visible density targets 25 books at 1920px and proportionally fewer on smaller screens; two additional edge-buffer books and a dark blurred fade keep the scrolling boundary out of view.
- Each topic has a permanent color. Wavy sections divide each spine in stable random proportions; black/white lettering adapts to each section. Bottom E/M/H stickers use green, yellow and red for difficulty.
- Hover to see the full title, or click a book to open its details below the shelf. The arrows move through the shelf; List view provides keyboard-accessible selection of every problem.
- Filtering drops unrelated visible books with Rapier physics. A moving window limits rendered books; the whole catalog remains accessible.
- Surprise me picks from the full catalog and clears active filters.
- Previous/Next follow the active filtered results. Copy URL copies the LeetCode URL. Shelve it closes the detail view; it does not save a bookmark.
- Pause stops shelf movement and physics. The system's reduced-motion preference disables automatic motion. A list view remains available if WebGL is unsupported.

The company associations and topics come from the CSV. Empty company cells mean the sources have no company match, rather than a claim that the question has never been asked.

## Update the data

```bash
python3 leetcode.py
python3 sync.py
```

[leetcode.py](./leetcode.py) updates [leetcode_problems.csv](./leetcode_problems.csv). It checks the remote problem ID/slug index, then fetches full details only for missing IDs, including gaps in the saved catalog. Existing CSV bytes, row order, metadata, extra columns and company associations remain intact. New rows are appended with an empty `company` cell. With no new problems, the file is not rewritten.

The ID index is paginated because LeetCode limits responses to 100 entries. The script waits one second between successful requests, retries transient failures up to three attempts, and retries rate-limited requests after two seconds. It validates the local CSV before network access, stages additions before replacing the file, and refuses to publish if the CSV changed during fetching. A failed run can be rerun safely; it refetches uncommitted additions.

See [SYNC.md](./SYNC.md) for the company-list sync. Run it after adding new questions to populate their company associations, then restart development or rebuild to include the refreshed CSV. The Python scripts remain separate from the frontend build.

## Check and build

```bash
npm test
npm run build
npm run preview
```

The production output is `dist/`. Fonts, problem data, and Rapier's WebAssembly are bundled locally. The 3D/physics bundle loads separately from the initial controls and data interface. It is approximately 1.1 MB compressed; first-load time depends on the connection and device.
