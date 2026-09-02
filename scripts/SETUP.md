# Setting up the daily catalog update (on the library's Windows PC)

One-time setup so the site updates itself every day. After this, nobody
needs to touch GitHub -- the PC does its thing, GitHub rebuilds the site
automatically.

## 1. Prerequisites on that PC

- Python + `pyodbc` (already required for `extract_miriam.py` -- see its
  own instructions if not done yet).
- [Git for Windows](https://git-scm.com/download/win) (includes Git
  Credential Manager, used below).

## 2. Clone the repo

```
cd C:\
git clone https://github.com/eliav-library/eliav-library.github.io.git
cd eliav-library.github.io
```

## 3. Create a GitHub access token (once)

1. On any computer, go to GitHub -> Settings -> Developer settings ->
   Personal access tokens -> Fine-grained tokens -> Generate new token.
2. Resource owner: `eliav-library`. Repository access: **only select
   repositories** -> `eliav-library.github.io`. Permissions: **Contents:
   Read and write** (nothing else needed).
3. Copy the token (you won't see it again).

## 4. Let Git remember the token on the library PC

```
cd C:\eliav-library.github.io
git push
```

This first push will prompt for credentials: username = your GitHub
username, password = **paste the token** (not your GitHub password). Git
Credential Manager stores it securely in Windows after that -- the token
never gets written into any script or file.

## 5. Test it once by hand

```
powershell -ExecutionPolicy Bypass -File scripts\update-catalog.ps1 -MdbPath "C:\Miriam\Miriam.mdb"
```

(`-ExecutionPolicy Bypass` only affects this one process -- it doesn't change
your system's default policy. Without it, Windows' default policy silently
blocks local .ps1 scripts, which is especially easy to miss under Task
Scheduler since there's no interactive prompt to notice the failure.)

Should print progress, then either "nothing to push" or "Pushed updated
catalog.json". Check https://eliav-library.github.io/ a minute later to
confirm it updated.

## 6. Schedule it to run daily

1. Open **Task Scheduler** -> Create Basic Task.
2. Name: `Eliav library catalog update`.
3. Trigger: Daily, pick a time (e.g. 3:00 AM, when the PC is idle).
4. Action: Start a program.
   - Program/script: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "C:\eliav-library.github.io\scripts\update-catalog.ps1" -MdbPath "C:\Miriam\Miriam.mdb"`
   - Start in: `C:\eliav-library.github.io`
5. Finish. Optionally open the task's Properties -> check "Run whether
   user is logged on or not" so it still runs overnight.

That's it -- from here on, the .mdb changes on the shelf, this task picks
it up once a day, and the public site follows automatically.
