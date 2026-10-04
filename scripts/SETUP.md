# Setting up the catalog sync (on the library's Windows PC)

One-time setup so the site stays current on its own. No git, no cloning a
repo -- `extract_miriam.py` talks to GitHub directly over HTTPS. The only
things this PC needs are Python, the `pyodbc` package, the one script file,
and the Microsoft Access ODBC driver -- which the PC almost certainly has
already, since Miriam itself is an Access program.

**How it behaves once set up:** every ~15 minutes while the PC is on
(starting the moment you log in), it quietly checks Miriam for new books,
classifies any it finds, and -- only if something actually changed --
pushes an update straight to GitHub, which republishes the site
automatically within about a minute. If nothing changed, it does nothing.
Running it every 15 minutes rather than at a fixed time or on shutdown is
deliberate: since the library's open hours vary and the PC isn't on a
predictable schedule, this way the catalog is never more than ~15 minutes
stale during however long the PC happens to be on, without needing to
guess a time or race Windows' shutdown process.

It also always re-checks GitHub for the current catalog before doing
anything else, rather than trusting a local copy -- so if someone edits a
book's tags directly (on GitHub, or through some future in-site editor),
this won't silently overwrite that the next time it runs.

## 1. Prerequisites on this PC

**Check this before installing Python** -- it decides which Python you want.
The script reads Miriam.mdb through the Microsoft Access ODBC driver, and
Python can only use a driver of its own bitness: 64-bit Python cannot use a
32-bit driver, or the other way round. Miriam is old enough that its driver
is often the 32-bit one, while python.org's big download button gives you
64-bit. Getting this backwards is the single most likely way this setup
wastes an afternoon.

Open both of these and look at the **Drivers** tab for "Microsoft Access
Driver (*.mdb, *.accdb)":

```
32-bit:  C:\Windows\SysWOW64\odbcad32.exe
64-bit:  C:\Windows\System32\odbcad32.exe
```

Whichever one lists it is the Python you want. (If both list it, either
works -- take 64-bit.) If *neither* lists it, install the free "Microsoft
Access Database Engine Redistributable" from Microsoft's site first.

Then:

- Python from https://python.org, in the bitness you just determined (check
  "Add python.exe to PATH" during install), then in Command Prompt:
  `pip install pyodbc`.
- That's it. No Git, no other installs.

**Escape hatch:** if the bitness question turns into a fight -- wrong Python
already installed, no admin rights to install the driver -- run
`pip install access_parser` instead. It's a pure-Python .mdb reader, so
bitness stops mattering entirely, and the script switches to it on its own
with no change to the command or the output.

## 2. Get the script

Download just this one file (no repo clone needed) to a folder of its
own, e.g. `C:\eliav-catalog-sync\extract_miriam.py`:

```
https://raw.githubusercontent.com/eliav-library/eliav-library.github.io/main/extract_miriam.py
```

(Save-as from that URL in a browser, or `curl -o extract_miriam.py <url>`
in Command Prompt if you have curl.)

## 3. Create a GitHub access token (once)

1. On any computer, go to GitHub -> Settings -> Developer settings ->
   Personal access tokens -> Fine-grained tokens -> Generate new token.
2. Resource owner: `eliav-library`. Repository access: **only select
   repositories** -> `eliav-library.github.io`. Permissions: **Contents:
   Read and write** (nothing else needed).
3. Copy the token (you won't see it again).

## 4. Store the token as an environment variable

This PC needs it available every time the script runs, without it being
typed anywhere or saved in a file:

1. Windows search -> "Environment Variables" -> Edit the system
   environment variables -> Environment Variables button.
2. Under "User variables", New...
   - Variable name: `GITHUB_TOKEN`
   - Variable value: paste the token
3. OK out of both dialogs.

(Task Scheduler tasks that run as your user pick up user environment
variables automatically -- no extra wiring needed.)

## 5. Test it once by hand

Open a **new** Command Prompt (so it picks up the environment variable
you just set) and run:

```
cd C:\eliav-catalog-sync
python extract_miriam.py "C:\Miriam\Miriam.mdb"
```

Should print progress, then either "No changes since the live catalog"
or "Pushed. N books live". Check https://eliav-library.github.io/ a
minute later to confirm it updated.

**If it says the password is invalid** (ODBC error `-1905`, or
`סיסמה לא חוקית` on a Hebrew Windows): this Miriam install has a database
password set. Supply it the same way as the GitHub token -- as an
environment variable, so it never sits in a file or in Task Scheduler's
arguments box:

```
setx MIRIAM_PASSWORD "the password"
```

Then open a **new** Command Prompt and run it again. (Add it through the
Environment Variables dialog instead if you'd rather not have it in the
console history.)

If nobody knows the password, `pip install access_parser` is the way out:
that reader opens the .mdb directly, with no driver and no password, and
the script switches to it automatically. The trade-off is that it reads
the file's bytes rather than going through Access's sharing layer, so it
is better suited to a quiet moment than to a run firing every 15 minutes
while a librarian is actively lending books. Prefer the password if you
can get it.

## 6. Schedule it

Open **Task Scheduler** -> Action menu -> **Create Task...** (not "Create
Basic Task" -- this needs a setting the basic wizard doesn't expose).

**General tab:**
- Name: `Eliav library catalog sync`

**Triggers tab** -> New...:
- Begin the task: **At log on**
- Advanced settings -> check **Repeat task every: 15 minutes**, **for a
  duration of: 8 hours** (generously covers a 1-2 hour open day with
  margin -- harmless if it stops repeating before the PC is turned off,
  since nothing else depends on it).
- Also check **Stop task if it runs longer than: 5 minutes** (safety net
  in case a run ever hangs on a network issue).

**Actions tab** -> New...:
- Program/script: `python.exe` (if Task Scheduler can't find it, use the
  full path shown by running `where python` in Command Prompt)
- Add arguments: `extract_miriam.py "C:\Miriam\Miriam.mdb"`
- Start in: `C:\eliav-catalog-sync`

**Settings tab:**
- Confirm "If the task is already running, then the following rule
  applies" is set to **Do not start a new instance** (prevents overlapping
  runs if one is ever still going when the next 15-minute tick arrives).

Finish. That's the whole setup -- from here on, whenever this PC is on,
new books show up on the live site within about 15 minutes.
