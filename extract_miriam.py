# -*- coding: utf-8 -*-
"""
extract_miriam.py

Converts a Miriam library database (Miriam.mdb) into catalog.json,
the format the library website's staff-upload page understands.

HOW TO RUN (Windows):
  1. Install Python from https://python.org (check "Add python.exe to PATH" during install).
  2. Open Command Prompt and run:
         pip install pyodbc
  3. Run this script, pointing it at the database file:
         python extract_miriam.py "C:\\Miriam\\Miriam.mdb"
     (If you leave the path off, it defaults to C:\\Miriam\\Miriam.mdb)
  4. It creates catalog.json next to this script.
  5. Upload catalog.json on the website's staff page.

REQUIREMENTS:
  This needs the "Microsoft Access Driver" to be installed on the PC running
  the script. Since Miriam itself is an Access-based program, most PCs that
  run Miriam already have a compatible driver. If you get a driver error,
  install the free "Microsoft Access Database Engine Redistributable" from
  Microsoft's site (search that exact name), then try again.
  It also needs internet access: new books are classified by looking their
  title/author up on Open Library.

NOTES ON THE MIRIAM SCHEMA (found by inspecting a real export):
  - The catalog table is called "Movies" (legacy naming from the software's
    origins as a video-rental system) but holds book records.
  - Field name quirks (also legacy): the column called "author" actually
    holds the PUBLISHER, and the column called "actor" actually holds the
    real book AUTHOR. This script accounts for that.
  - "instore" (1/0) is a live flag Miriam maintains itself: 1 = on the shelf,
    0 = currently checked out. No need to cross-reference loan tables.
  - Miriam's own "category"/"stype" fields are NOT used for genre anymore --
    they're free-text and wildly inconsistent (author names, series names,
    and genres all mixed into the same field). Genre tags are instead looked
    up per book (see GENRE TAGGING below).
  - Patron/loan tables (Customers, Rents, History) are intentionally never
    read by this script -- the site only ever needs title/author/genre/status.

GENRE TAGGING:
  Each book gets zero or more tags from the fixed list in GENRE_TAG_HELP
  below (language from the title text itself; age group and topic from an
  Open Library lookup by title+author -- no API key needed). To avoid
  re-querying on every run, books already present in the previous
  catalog.json (matched by Miriam's movie_id) keep their previously computed
  tags -- only books new since the last run get looked up. Delete
  catalog.json to force a full re-classification of every book.
"""

import sys
import os
import re
import json
import time
import datetime
import urllib.request
import urllib.parse
import concurrent.futures

GENRE_TAG_HELP = """
  language:   עברית, אנגלית               (from the title's own script)
  age group:  ילדים, נוער, מבוגרים         (from Open Library, default מבוגרים)
  topic:      עיון, ספרות יפה, פנטזיה ומד"ב, קומיקס, יהדות, ביוגרפיה
"""

HEBREW_RE = re.compile(r"[\u0590-\u05FF]")

# Open Library subject text (lowercased) -> our topic tag.
# Checked in order; a book can match several.
TOPIC_KEYWORDS = [
    ("comic", "קומיקס"),
    ("graphic novel", "קומיקס"),
    ("biography", "ביוגרפיה"),
    ("autobiography", "ביוגרפיה"),
    ("religion", "יהדות"),
    ("judaism", "יהדות"),
    ("fantasy", "פנטזיה ומד\"ב"),
    ("science fiction", "פנטזיה ומד\"ב"),
]
AGE_KEYWORDS = [
    ("juvenile", "ילדים"),
    ("young adult", "נוער"),
    ("children", "ילדים"),
]


def clean(value):
    return (str(value).strip() if value is not None else "")


def detect_language(title):
    return "עברית" if HEBREW_RE.search(title) else "אנגלית"


def fetch_book_subjects(title, author):
    """Best-effort lookup against Open Library; returns [] if nothing is found.

    Google Books' keyless tier turned out to share one small global quota
    across every unauthenticated caller on the internet -- once someone else
    exhausts it, every request fails with 429 regardless of how slowly we
    pace our own calls (confirmed live: 429 even after 30s of backoff).
    Open Library's search API needs no key at all and rate-limits per-IP
    instead, and it's real (confirmed by other tools hitting it in the wild)
    but its exact threshold isn't reliably documented -- so instead of
    guessing a fixed delay between every request, we go back-to-back and
    only back off on an actual 429/403 from the server.
    """
    params = {"title": title, "fields": "subject", "limit": 1}
    if author:
        params["author"] = author
    url = "https://openlibrary.org/search.json?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=8) as resp:
                data = json.load(resp)
            docs = data.get("docs", [])
            return [s.lower() for s in docs[0].get("subject", [])] if docs else []
        except urllib.error.HTTPError as e:
            if e.code in (429, 403) and attempt < 3:
                wait = 5 * (attempt + 1)
                print(f"  (throttled, retrying {title!r} in {wait}s...)")
                time.sleep(wait)
                continue
            print(f"  (lookup failed for {title!r}: {e})")
            return []
        except Exception as e:
            print(f"  (lookup failed for {title!r}: {e})")
            return []
    return []


def tags_from_categories(subjects):
    """Pure mapping: lowercased Open Library subject strings -> our age/topic tags."""
    text = " ".join(subjects)
    tags = [next((tag for kw, tag in AGE_KEYWORDS if kw in text), "מבוגרים")]

    for kw, tag in TOPIC_KEYWORDS:
        if kw in text and tag not in tags:
            tags.append(tag)
    if "fiction" in text and "פנטזיה ומד\"ב" not in tags and "קומיקס" not in tags:
        tags.append("ספרות יפה")
    elif not any(tag in tags for tag in ("קומיקס", "ביוגרפיה", "יהדות", "פנטזיה ומד\"ב", "ספרות יפה")):
        tags.append("עיון")

    return tags


def classify_genres(title, author):
    subjects = fetch_book_subjects(title, author)
    return [detect_language(title)] + tags_from_categories(subjects)


def _self_check():
    assert detect_language("הארי פוטר") == "עברית"
    assert detect_language("Harry Potter") == "אנגלית"

    assert tags_from_categories([]) == ["מבוגרים", "עיון"]
    assert tags_from_categories(["juvenile fiction"]) == ["ילדים", "ספרות יפה"]
    assert tags_from_categories(["young adult fiction / fantasy"]) == ["נוער", "פנטזיה ומד\"ב"]
    assert tags_from_categories(["comics & graphic novels"]) == ["מבוגרים", "קומיקס"]
    assert tags_from_categories(["biography & autobiography"]) == ["מבוגרים", "ביוגרפיה"]
    assert tags_from_categories(["religion / judaism"]) == ["מבוגרים", "יהדות"]
    print("self-check OK")


def load_previous_genres(out_path):
    """movie_id -> previously computed genre tags, so unchanged books skip the lookup."""
    if not os.path.exists(out_path):
        return {}
    try:
        with open(out_path, "r", encoding="utf-8") as f:
            previous = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    return {
        b["id"]: b["genre"]
        for b in previous.get("books", [])
        if isinstance(b.get("genre"), list) and b.get("id")
    }


def read_movies_from_access(db_path):
    """Real path: read title/author/instore rows straight out of Miriam.mdb via ODBC."""
    try:
        import pyodbc
    except ImportError:
        print("Missing dependency. Run:  pip install pyodbc")
        sys.exit(1)

    conn_str = (
        r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
        rf"DBQ={db_path};"
    )
    try:
        conn = pyodbc.connect(conn_str)
    except pyodbc.Error as e:
        print("Could not open the database.")
        print("Path tried:", db_path)
        print("Underlying error:", e)
        print()
        print("If this mentions a missing driver, install the free")
        print('"Microsoft Access Database Engine Redistributable" from Microsoft')
        print("(match 32-bit/64-bit to your Python install) and try again.")
        sys.exit(1)

    cursor = conn.cursor()

    # library name, for the site header (best-effort; falls back if missing)
    library_name = ""
    try:
        cursor.execute("SELECT store_name FROM Store")
        row = cursor.fetchone()
        if row and row[0]:
            library_name = clean(row[0])
    except pyodbc.Error:
        pass

    cursor.execute("SELECT movie_id, movie_name, author, actor, instore FROM Movies")
    rows = [
        (clean(movie_id), clean(movie_name), clean(publisher), clean(real_author), instore)
        for movie_id, movie_name, publisher, real_author, instore in cursor.fetchall()
        if clean(movie_name)
    ]
    conn.close()
    return library_name, rows


# ponytail: dev-only stand-in for the Movies table, so the rest of the
# pipeline (classification, caching, JSON writing) is testable without a real
# Miriam.mdb or the Windows-only Access ODBC driver. Not used in production.
# Real, well-known titles on purpose -- Open Library actually has subject data
# for these, unlike most obscure Hebrew community-library inventory.
MOCK_MOVIES_POOL = [
    ("1", "הארי פוטר ואבן החכמים", "", "ג'יי קיי רואולינג", 1),
    ("2", "Harry Potter and the Philosopher's Stone", "", "J.K. Rowling", 1),
    ("3", "The Hobbit", "", "J.R.R. Tolkien", 0),
    ("4", "Dune", "", "Frank Herbert", 1),
    ("5", "The Hunger Games", "", "Suzanne Collins", 1),
    ("6", "פו הדב", "", "א.א. מילן", 1),
    ("7", "Winnie-the-Pooh", "", "A.A. Milne", 1),
    ("8", "Curious George", "", "H.A. Rey", 1),
    ("9", "Percy Jackson and the Olympians", "", "Rick Riordan", 1),
    ("10", "Diary of a Wimpy Kid", "", "Jeff Kinney", 1),
    ("11", "Maus", "", "Art Spiegelman", 1),
    ("12", "Persepolis", "", "Marjane Satrapi", 0),
    ("13", "Watchmen", "", "Alan Moore", 1),
    ("14", "Steve Jobs", "", "Walter Isaacson", 1),
    ("15", "Anne Frank: The Diary of a Young Girl", "", "Anne Frank", 1),
    ("16", "Sapiens: A Brief History of Humankind", "", "Yuval Noah Harari", 1),
    ("17", "A Brief History of Time", "", "Stephen Hawking", 1),
    ("18", "The Chosen", "", "Chaim Potok", 1),
    ("19", "תולדות עם ישראל", "", "פרופ' כהן", 1),
    ("20", "1984", "", "George Orwell", 0),
]


def read_movies_mock(count_spec="all"):
    pool = MOCK_MOVIES_POOL
    rows = pool if count_spec == "all" else pool[: int(count_spec)]
    return "ספריית בדיקה (מוק)", rows


def main():
    argv = sys.argv[1:]
    mock_count = None
    if "--mock" in argv:
        i = argv.index("--mock")
        rest = argv[i + 1 : i + 2]
        mock_count = rest[0] if rest else "all"
        argv = argv[:i] + argv[i + 1 + len(rest) :]
    mock = mock_count is not None

    db_path = argv[0] if argv else r"C:\Miriam\Miriam.mdb"

    if mock:
        if mock_count != "all" and not mock_count.isdigit():
            print(f"--mock expects a number of books or 'all', got: {mock_count!r}")
            sys.exit(1)
        print(f"Running in --mock mode ({mock_count}): skipping Miriam.mdb, using fake sample rows.")
        library_name, rows = read_movies_mock(mock_count)
    else:
        library_name, rows = read_movies_from_access(db_path)

    out_path = "catalog.json"
    cached_genres = load_previous_genres(out_path)
    to_classify = [r for r in rows if r[0] not in cached_genres]

    # Each lookup is network-latency-bound, not CPU-bound, so a few run
    # concurrently instead of one-at-a-time. Open Library has no batch
    # endpoint for title/author search (only for exact ISBNs, which Miriam's
    # isbn column doesn't actually have real data in). fetch_book_subjects
    # still backs off on its own if the server actually throttles a thread.
    new_genres = {}
    if to_classify:
        completed = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = {
                pool.submit(classify_genres, title, real_author): (movie_id, title)
                for movie_id, title, _publisher, real_author, _instore in to_classify
            }
            for future in concurrent.futures.as_completed(futures):
                movie_id, title = futures[future]
                completed += 1
                print(f"Classifying ({completed}/{len(to_classify)}): {title}")
                new_genres[movie_id] = future.result()

    books = []
    reused, looked_up = 0, 0
    for movie_id, title, publisher, real_author, instore in rows:
        genre = cached_genres.get(movie_id)
        if genre is not None:
            reused += 1
        else:
            genre = new_genres[movie_id]
            looked_up += 1
        books.append(
            {
                "id": movie_id,
                "title": title,
                "author": real_author,
                "publisher": publisher,
                "genre": genre,
                "status": "available" if str(instore) == "1" or instore == 1 else "out",
            }
        )

    output = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "libraryName": library_name,
        "books": books,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Done. Wrote {len(books)} books to {out_path}")
    print(f"Genres: {reused} reused from previous catalog, {looked_up} newly classified.")
    if library_name:
        print(f"Library name detected: {library_name}")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _self_check()
    else:
        main()
