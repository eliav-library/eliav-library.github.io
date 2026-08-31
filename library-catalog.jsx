import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { Search, UploadCloud, BookOpen, X, Check, ArrowRight, RefreshCw, ChevronDown, Lock, LogOut, KeyRound } from "lucide-react";

// ---------- design tokens ----------
// Wood + brass + ivory index-card palette: the page is the reading room,
// each book is a literal card-catalog card.
const T = {
  wood: "#2E2420",
  woodDeep: "#211A17",
  brass: "#B98B3E",
  brassSoft: "#8C6A34",
  card: "#FBF6E9",
  cardEdge: "#E4D9BC",
  ink: "#241C15",
  inkSoft: "#5B4E3F",
  cream: "#F3ECDA",
  green: "#3F5A45",
  rust: "#9C4A34",
};

const FONT_DISPLAY = "'Frank Ruhl Libre', 'Times New Roman', serif";
const FONT_BODY = "'Heebo', 'Arial Hebrew', sans-serif";
const DEFAULT_STAFF_CODE = "1234";

const FONT_LINK = (
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Heebo:wght@300;400;500;700&display=swap"
  />
);

// ---------- header-guessing for auto mapping ----------
const GUESS = {
  title: ["כותר", "שם הספר", "שם ספר", "שם", "title"],
  author: ["מחבר", "סופר", "author"],
  genre: ["נושא", "קטגוריה", "ז'אנר", "זאנר", "genre", "subject"],
  loan: ["שם שואל", "שואל", "הושאל", "מושאל", "מצב", "status", "borrower"],
  due: ["תאריך החזרה", "להחזרה", "יעד החזרה", "due"],
};

function guessColumn(headers, keywords) {
  const lower = headers.map((h) => String(h || "").trim());
  for (const kw of keywords) {
    const found = lower.find((h) => h.includes(kw));
    if (found) return found;
  }
  return "";
}

// a book can carry several genre tags (e.g. אנגלית + מבוגרים + פנטזיה);
// accepts either an array (from the extraction script) or a delimited string (from a spreadsheet cell)
function normalizeGenreList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/[,/;|]/);
  const list = Array.from(new Set(raw.map((g) => String(g).trim()).filter(Boolean)));
  return list.length ? list : ["כללי"];
}

function buildBooks(headers, rows, mapping) {
  const col = (key) => headers.indexOf(mapping[key]);
  const tI = col("title"), aI = col("author"), gI = col("genre"), lI = col("loan"), dI = col("due");
  const out = [];
  rows.forEach((r, i) => {
    const title = tI >= 0 ? String(r[tI] ?? "").trim() : "";
    if (!title) return;
    const loanVal = lI >= 0 ? String(r[lI] ?? "").trim() : "";
    out.push({
      id: i,
      title,
      author: aI >= 0 ? String(r[aI] ?? "").trim() : "",
      genre: normalizeGenreList(gI >= 0 ? r[gI] : ""),
      status: loanVal ? "out" : "available",
      due: dI >= 0 ? String(r[dI] ?? "").trim() : "",
    });
  });
  return out;
}

// ---------- routing (hash-based, so genre pages and the staff page are real, linkable URLs) ----------
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, ""));
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#/, ""));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = (h) => {
    window.location.hash = h;
  };
  if (hash === "staff") return [{ type: "staff" }, navigate];
  if (hash.startsWith("genre/")) return [{ type: "genre", genre: decodeURIComponent(hash.slice(6)) }, navigate];
  return [{ type: "home" }, navigate];
}

// ---------- stamp ----------
function Stamp({ status, due }) {
  const isOut = status === "out";
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        transform: "rotate(-8deg)",
        border: `2px solid ${isOut ? T.rust : T.green}`,
        color: isOut ? T.rust : T.green,
        borderRadius: 6,
        padding: "3px 8px",
        fontFamily: FONT_BODY,
        fontWeight: 700,
        fontSize: 11.5,
        letterSpacing: 0.5,
        opacity: 0.9,
        background: "rgba(255,255,255,0.35)",
      }}
    >
      {isOut ? "מושאל" : "זמין"}
      {isOut && due ? (
        <div style={{ fontSize: 9.5, fontWeight: 400, marginTop: 1, textAlign: "center" }}>עד {due}</div>
      ) : null}
    </div>
  );
}

// ---------- book card ----------
function BookCard({ book }) {
  return (
    <div
      style={{
        position: "relative",
        background: T.card,
        border: `1px solid ${T.cardEdge}`,
        borderRadius: 3,
        padding: "18px 16px 14px",
        boxShadow: "0 3px 0 rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.18)",
        minHeight: 132,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <Stamp status={book.status} due={book.due} />
      <div
        style={{
          fontFamily: FONT_BODY,
          fontSize: 10.5,
          color: T.brassSoft,
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        {book.genre.join(" · ")}
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 19, color: T.ink, lineHeight: 1.25 }}>
        {book.title}
      </div>
      {book.author ? (
        <div style={{ fontFamily: FONT_BODY, fontSize: 13.5, color: T.inkSoft, marginTop: 3 }}>{book.author}</div>
      ) : null}
    </div>
  );
}

// ---------- upload / mapping panel ----------
function normalizeJsonBook(b, i) {
  const status = b && (b.status === "out" || b.status === false) ? "out" : b && b.status === "available" ? "available" : b && b.instore === 0 ? "out" : "available";
  return {
    id: b && b.id != null ? b.id : i,
    title: String((b && b.title) || "").trim(),
    author: String((b && b.author) || "").trim(),
    genre: normalizeGenreList(b && b.genre),
    status,
    due: String((b && b.due) || "").trim(),
  };
}

function UploadPanel({ onSaved }) {
  const [stage, setStage] = useState("pick"); // pick | map | confirmJson | saving | done | error
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({ title: "", author: "", genre: "", loan: "", due: "" });
  const [jsonBooks, setJsonBooks] = useState([]);
  const [jsonMeta, setJsonMeta] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function saveBooks(books, extraMeta) {
    setStage("saving");
    try {
      await window.storage.set("catalog:data", JSON.stringify(books), true);
      await window.storage.set(
        "catalog:meta",
        JSON.stringify({ updatedAt: new Date().toISOString(), count: books.length, ...(extraMeta || {}) }),
        true
      );
      setStage("done");
      setTimeout(() => onSaved(), 900);
    } catch (e) {
      setErrorMsg("שמירת הקטלוג נכשלה. נסו שוב.");
      setStage("error");
    }
  }

  function handleJsonFile(file) {
    const reader = new FileReader();
    reader.onerror = () => {
      setErrorMsg("לא הצלחנו לקרוא את הקובץ. נסו שוב.");
      setStage("error");
    };
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const list = Array.isArray(parsed) ? parsed : parsed.books;
        if (!Array.isArray(list)) throw new Error("bad shape");
        const normalized = list.map(normalizeJsonBook).filter((b) => b.title);
        if (!normalized.length) throw new Error("empty");
        setJsonBooks(normalized);
        setJsonMeta(!Array.isArray(parsed) && parsed.libraryName ? { libraryName: String(parsed.libraryName).trim() } : null);
        setStage("confirmJson");
      } catch (e) {
        setErrorMsg("קובץ ה-JSON אינו בפורמט המצופה. ודאו שזהו קובץ שהופק על ידי סקריפט החילוץ.");
        setStage("error");
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleFile(file) {
    setErrorMsg("");
    if (/\.json$/i.test(file.name)) {
      handleJsonFile(file);
      return;
    }
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => setErrorMsg("לא הצלחנו לקרוא את הקובץ. נסו שוב.");
    reader.onload = (evt) => {
      try {
        const wb = isCsv
          ? XLSX.read(evt.target.result, { type: "string" })
          : XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!grid.length) throw new Error("empty");
        const hdrs = grid[0].map((h) => String(h ?? "").trim());
        const dataRows = grid.slice(1);
        setHeaders(hdrs);
        setRows(dataRows);
        setMapping({
          title: guessColumn(hdrs, GUESS.title),
          author: guessColumn(hdrs, GUESS.author),
          genre: guessColumn(hdrs, GUESS.genre),
          loan: guessColumn(hdrs, GUESS.loan),
          due: guessColumn(hdrs, GUESS.due),
        });
        setStage("map");
      } catch (e) {
        setErrorMsg("לא הצלחנו לפענח את הקובץ. ודאו שמדובר בקובץ אקסל (xls/xlsx), CSV עם שורת כותרות, או JSON מהסקריפט.");
        setStage("error");
      }
    };
    if (isCsv) reader.readAsText(file, "UTF-8");
    else reader.readAsArrayBuffer(file);
  }

  async function handleConfirm() {
    const books = buildBooks(headers, rows, mapping);
    await window.storage.set("catalog:mapping", JSON.stringify(mapping), true);
    saveBooks(books, {});
  }

  function handleConfirmJson() {
    saveBooks(jsonBooks, jsonMeta || {});
  }

  const genreCounts = useMemo(() => {
    const c = {};
    jsonBooks.forEach((b) => {
      b.genre.forEach((g) => {
        c[g] = (c[g] || 0) + 1;
      });
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [jsonBooks]);

  const fieldLabel = { title: "כותר (חובה)", author: "מחבר", genre: "נושא / ז'אנר", loan: "עמודת השאלה", due: "תאריך החזרה" };
  const fieldHint = {
    loan: "אם יש ערך בעמודה זו — הפריט יסומן כ'מושאל'. אפשר להשאיר ריק.",
    genre: "אפשר להפריד כמה נושאים באותו תא בפסיק (למשל: אנגלית, נוער).",
  };

  return (
    <div>
      {stage === "pick" && (
        <div>
          <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.7, marginBottom: 18 }}>
            ייצאו דוח מתוכנת מרים לאקסל (או CSV) הכולל כותר, מחבר, נושא, ועמודת השאלה — והעלו אותו כאן.
            הקובץ יחליף את הקטלוג המוצג באתר.
          </p>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              border: `2px dashed ${T.cardEdge}`,
              borderRadius: 6,
              padding: "36px 16px",
              cursor: "pointer",
              color: T.brassSoft,
            }}
          >
            <UploadCloud size={28} />
            <span style={{ fontWeight: 500 }}>לחצו לבחירת קובץ (JSON מהסקריפט, או xlsx / xls / csv)</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              style={{ display: "none" }}
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {stage === "confirmJson" && (
        <div>
          <p style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.7, marginBottom: 14 }}>
            הקובץ זוהה כפלט של סקריפט החילוץ ({jsonBooks.length} ספרים{jsonMeta && jsonMeta.libraryName ? `, מ"${jsonMeta.libraryName}"` : ""}). אין צורך בהתאמת עמודות.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {genreCounts.map(([g, n]) => (
              <span
                key={g}
                style={{ fontSize: 11.5, background: T.cardEdge, color: T.inkSoft, borderRadius: 12, padding: "3px 10px" }}
              >
                {g} · {n}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleConfirmJson}
              style={{
                flex: 1,
                background: T.green,
                color: "#fff",
                border: "none",
                borderRadius: 5,
                padding: "11px 0",
                fontFamily: FONT_BODY,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              שמירה ופרסום בקטלוג
            </button>
            <button
              onClick={() => setStage("pick")}
              style={{
                background: "none",
                border: `1px solid ${T.cardEdge}`,
                borderRadius: 5,
                padding: "11px 16px",
                fontFamily: FONT_BODY,
                cursor: "pointer",
                color: T.inkSoft,
              }}
            >
              קובץ אחר
            </button>
          </div>
        </div>
      )}

      {stage === "map" && (
        <div>
          <p style={{ fontSize: 13.5, color: T.inkSoft, marginBottom: 16 }}>
            ניחשנו התאמה לפי שמות העמודות בקובץ. בדקו ותקנו במידת הצורך.
          </p>
          {Object.keys(fieldLabel).map((key) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{fieldLabel[key]}</div>
              <select
                value={mapping[key]}
                onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 5,
                  border: `1px solid ${T.cardEdge}`,
                  background: "#fff",
                  fontFamily: FONT_BODY,
                  fontSize: 13.5,
                }}
              >
                <option value="">— ללא —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              {fieldHint[key] && <div style={{ fontSize: 11.5, color: T.brassSoft, marginTop: 3 }}>{fieldHint[key]}</div>}
            </div>
          ))}
          <div style={{ fontSize: 12, color: T.inkSoft, margin: "10px 0 18px" }}>נמצאו {rows.length} שורות בקובץ.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleConfirm}
              disabled={!mapping.title}
              style={{
                flex: 1,
                background: mapping.title ? T.green : "#ccc",
                color: "#fff",
                border: "none",
                borderRadius: 5,
                padding: "11px 0",
                fontFamily: FONT_BODY,
                fontWeight: 700,
                cursor: mapping.title ? "pointer" : "not-allowed",
              }}
            >
              שמירה ופרסום בקטלוג
            </button>
            <button
              onClick={() => setStage("pick")}
              style={{
                background: "none",
                border: `1px solid ${T.cardEdge}`,
                borderRadius: 5,
                padding: "11px 16px",
                fontFamily: FONT_BODY,
                cursor: "pointer",
                color: T.inkSoft,
              }}
            >
              קובץ אחר
            </button>
          </div>
        </div>
      )}

      {stage === "saving" && <div style={{ padding: 30, textAlign: "center", color: T.inkSoft }}>שומר…</div>}

      {stage === "done" && (
        <div style={{ padding: 30, textAlign: "center", color: T.green, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Check size={26} />
          <div>הקטלוג עודכן בהצלחה</div>
        </div>
      )}

      {stage === "error" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ color: T.rust, marginBottom: 16 }}>{errorMsg}</div>
          <button
            onClick={() => setStage("pick")}
            style={{ background: T.green, color: "#fff", border: "none", borderRadius: 5, padding: "9px 18px", cursor: "pointer" }}
          >
            נסו שוב
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- change access code ----------
function ChangeCodePanel() {
  const [open, setOpen] = useState(false);
  const [code1, setCode1] = useState("");
  const [code2, setCode2] = useState("");
  const [msg, setMsg] = useState("");

  async function save() {
    setMsg("");
    if (!code1.trim() || code1.length < 4) {
      setMsg("הקוד צריך להיות לפחות 4 תווים.");
      return;
    }
    if (code1 !== code2) {
      setMsg("הקודים אינם תואמים.");
      return;
    }
    try {
      await window.storage.set("catalog:staff_code", code1.trim(), true);
      setMsg("הקוד עודכן.");
      setCode1("");
      setCode2("");
      setTimeout(() => setOpen(false), 900);
    } catch {
      setMsg("העדכון נכשל, נסו שוב.");
    }
  }

  return (
    <div style={{ marginTop: 26, borderTop: `1px solid ${T.cardEdge}`, paddingTop: 16 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", color: T.brassSoft, cursor: "pointer", fontFamily: FONT_BODY, fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}
      >
        <KeyRound size={13} /> שינוי קוד גישה לצוות
      </button>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, maxWidth: 260 }}>
          <input
            type="password"
            placeholder="קוד חדש"
            value={code1}
            onChange={(e) => setCode1(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 5, border: `1px solid ${T.cardEdge}`, fontFamily: FONT_BODY }}
          />
          <input
            type="password"
            placeholder="אימות קוד חדש"
            value={code2}
            onChange={(e) => setCode2(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 5, border: `1px solid ${T.cardEdge}`, fontFamily: FONT_BODY }}
          />
          <button
            onClick={save}
            style={{ background: T.brass, color: T.woodDeep, border: "none", borderRadius: 5, padding: "8px 0", fontFamily: FONT_BODY, fontWeight: 700, cursor: "pointer" }}
          >
            שמירת קוד
          </button>
          {msg && <div style={{ fontSize: 12, color: T.inkSoft }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}

// ---------- staff gate ----------
function StaffGate({ onAuthed }) {
  // Starts usable immediately against the default code; if a custom code
  // was saved, it overrides this once the lookup resolves. This way the
  // button never silently does nothing while waiting on storage.
  const [storedCode, setStoredCode] = useState(DEFAULT_STAFF_CODE);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.storage.get("catalog:staff_code", true);
        if (!cancelled && res && res.value) setStoredCode(res.value);
      } catch {
        // no custom code saved yet -- default stays in effect
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function submit(e) {
    e.preventDefault();
    if (input.trim() === storedCode) {
      setError("");
      onAuthed();
    } else {
      setError("קוד שגוי, נסו שוב.");
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "30px 10px" }}
    >
      <Lock size={26} color={T.brassSoft} />
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, color: T.ink }}>אזור צוות</div>
      <div style={{ fontSize: 13, color: T.inkSoft }}>הזינו את קוד הגישה כדי לעדכן את הקטלוג</div>
      <input
        type="password"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="קוד גישה"
        autoFocus
        style={{ padding: "10px 14px", borderRadius: 6, border: `1px solid ${T.cardEdge}`, fontFamily: FONT_BODY, fontSize: 14, width: 200, textAlign: "center" }}
      />
      <button
        type="submit"
        style={{ background: T.green, color: "#fff", border: "none", borderRadius: 6, padding: "9px 26px", fontFamily: FONT_BODY, fontWeight: 700, cursor: "pointer" }}
      >
        כניסה
      </button>
      {error && <div style={{ color: T.rust, fontSize: 12.5 }}>{error}</div>}
      {storedCode === DEFAULT_STAFF_CODE && (
        <div style={{ fontSize: 11, color: "#B49A6E", maxWidth: 240, textAlign: "center", lineHeight: 1.6 }}>
          שימו לב: עדיין נעשה שימוש בקוד ברירת המחדל ({DEFAULT_STAFF_CODE}). מומלץ להחליפו לאחר הכניסה הראשונה.
        </div>
      )}
    </form>
  );
}

function StaffPage({ onSaved, onExit }) {
  const [authed, setAuthed] = useState(false);
  return (
    <div style={{ minHeight: "100%", background: T.wood, padding: "40px 16px" }}>
      {FONT_LINK}
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          background: T.card,
          borderRadius: 8,
          padding: 28,
          color: T.ink,
          fontFamily: FONT_BODY,
          boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: authed ? 18 : 0 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700 }}>{authed ? "עדכון קטלוג" : ""}</div>
          <button onClick={onExit} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkSoft, display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_BODY, fontSize: 12.5 }}>
            {authed ? (
              <>
                <LogOut size={16} /> יציאה
              </>
            ) : (
              <>
                <X size={20} />
              </>
            )}
          </button>
        </div>
        {authed ? (
          <>
            <UploadPanel onSaved={onSaved} />
            <ChangeCodePanel />
          </>
        ) : (
          <StaffGate onAuthed={() => setAuthed(true)} />
        )}
      </div>
    </div>
  );
}

// ---------- main app ----------
export default function LibraryCatalog() {
  const [route, navigate] = useHashRoute();
  const [books, setBooks] = useState(null);
  const [meta, setMeta] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("הכל");

  // Static site, no backend: catalog.json is a plain file in the deployed
  // build, republished by the nightly extraction pipeline (not by this page).
  async function loadData() {
    try {
      const res = await fetch("catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error("no catalog.json yet");
      const data = await res.json();
      const books = (data.books || []).map((b) => ({ ...b, genre: normalizeGenreList(b.genre) }));
      setBooks(books);
      setMeta({ libraryName: data.libraryName || "", count: books.length, updatedAt: data.generatedAt });
    } catch {
      setBooks([]);
      setMeta(null);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const genres = useMemo(() => {
    if (!books) return [];
    return Array.from(new Set(books.flatMap((b) => b.genre))).sort((a, b) => a.localeCompare(b, "he"));
  }, [books]);

  const activeGenre = route.type === "genre" ? route.genre : null;

  const filtered = useMemo(() => {
    if (!books) return [];
    return books
      .filter((b) => (activeGenre ? b.genre.includes(activeGenre) : true))
      .filter((b) => (status === "הכל" ? true : b.status === status))
      .filter((b) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
      })
      .sort((a, b) => a.title.localeCompare(b.title, "he"));
  }, [books, activeGenre, status, query]);

  if (route.type === "staff") {
    return <StaffPage onSaved={() => { loadData(); navigate(""); }} onExit={() => navigate("")} />;
  }

  return (
    <div style={{ minHeight: "100%", background: T.wood }} dir="rtl">
      {FONT_LINK}

      {/* hero */}
      <div style={{ background: T.woodDeep, padding: "38px 20px 24px", textAlign: "center" }}>
        <div style={{ color: T.brass, fontFamily: FONT_BODY, fontSize: 12, letterSpacing: 2, marginBottom: 6 }}>
          {meta && meta.libraryName ? `קטלוג ${meta.libraryName}` : "קטלוג הספרייה הקהילתית"}
        </div>
        <div
          style={{ color: T.cream, fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: "clamp(28px, 5vw, 42px)", cursor: "pointer" }}
          onClick={() => navigate("")}
        >
          {activeGenre ? activeGenre : "מה יש על המדף?"}
        </div>
        <div style={{ color: "#C9BBA1", fontFamily: FONT_BODY, fontSize: 13.5, marginTop: 8 }}>
          {meta ? `${meta.count} כותרים בקטלוג · עודכן לאחרונה ${new Date(meta.updatedAt).toLocaleDateString("he-IL")}` : ""}
        </div>

        <div style={{ maxWidth: 480, margin: "22px auto 0", position: "relative" }}>
          <Search size={17} color={T.brassSoft} style={{ position: "absolute", right: 14, top: 13 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם ספר או מחבר…"
            style={{
              width: "100%",
              padding: "12px 40px 12px 14px",
              borderRadius: 24,
              border: "none",
              fontFamily: FONT_BODY,
              fontSize: 14.5,
              background: T.cream,
              color: T.ink,
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* genre pages nav — drawer labels */}
      {genres.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "center",
            padding: "16px 16px 0",
            borderBottom: `1px solid rgba(185,139,62,0.25)`,
            paddingBottom: 14,
          }}
        >
          <GenreTab label="הכל" active={!activeGenre} onClick={() => navigate("")} />
          {genres.map((g) => (
            <GenreTab key={g} label={g} active={activeGenre === g} onClick={() => navigate(`genre/${encodeURIComponent(g)}`)} />
          ))}
        </div>
      )}

      {/* status filter */}
      <div style={{ display: "flex", justifyContent: "center", padding: "16px 16px 0" }}>
        <FilterSelect
          value={status}
          onChange={setStatus}
          options={["הכל", "available", "out"]}
          display={{ הכל: "הכל", available: "זמין בלבד", out: "מושאל בלבד" }}
        />
      </div>

      {/* grid */}
      <div style={{ padding: "18px 20px 60px", maxWidth: 1080, margin: "0 auto" }}>
        {books === null ? (
          <div style={{ textAlign: "center", color: T.cream, padding: 60, fontFamily: FONT_BODY }}>טוען…</div>
        ) : books.length === 0 ? (
          <EmptyState onUpload={() => navigate("staff")} />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: T.cream, padding: 60, fontFamily: FONT_BODY }}>לא נמצאו ספרים תואמים.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 20 }}>
            {filtered.map((b) => (
              <BookCard key={b.id} book={b} />
            ))}
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{ textAlign: "center", paddingBottom: 30 }}>
        <button
          onClick={() => navigate("staff")}
          style={{
            background: "none",
            border: "none",
            color: "#8C7A5F",
            fontFamily: FONT_BODY,
            fontSize: 12.5,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={13} /> צוות הספרייה — עדכון קטלוג
        </button>
      </div>
    </div>
  );
}

function GenreTab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? T.brass : "transparent",
        color: active ? T.woodDeep : T.cream,
        border: `1px solid ${active ? T.brass : "rgba(243,236,218,0.35)"}`,
        borderRadius: "4px 4px 0 0",
        padding: "7px 14px",
        fontFamily: FONT_BODY,
        fontSize: 12.5,
        fontWeight: active ? 700 : 400,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function FilterSelect({ value, onChange, options, display }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          padding: "9px 30px 9px 14px",
          borderRadius: 20,
          border: `1px solid ${T.brassSoft}`,
          background: "transparent",
          color: T.cream,
          fontFamily: FONT_BODY,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o} style={{ color: T.ink }}>
            {display ? display[o] : o}
          </option>
        ))}
      </select>
      <ChevronDown size={14} color={T.brass} style={{ position: "absolute", left: 10, top: 10, pointerEvents: "none" }} />
    </div>
  );
}

function EmptyState({ onUpload }) {
  return (
    <div style={{ textAlign: "center", color: T.cream, padding: "70px 20px", fontFamily: FONT_BODY, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <BookOpen size={34} color={T.brass} />
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700 }}>הקטלוג עדיין ריק</div>
      <div style={{ fontSize: 13.5, color: "#C9BBA1", maxWidth: 340 }}>
        יש לייצא דוח מתוכנת מרים ולהעלות אותו כדי להציג כאן את ספרי הספרייה.
      </div>
      <button
        onClick={onUpload}
        style={{
          marginTop: 6,
          background: T.brass,
          color: T.woodDeep,
          border: "none",
          borderRadius: 20,
          padding: "10px 22px",
          fontFamily: FONT_BODY,
          fontWeight: 700,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <ArrowRight size={15} /> כניסת צוות
      </button>
    </div>
  );
}
