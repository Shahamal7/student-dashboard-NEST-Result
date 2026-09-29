# Student Performance Dashboard

A free, live student information dashboard.

- **Google Sheets** holds the data (the single source of truth).
- **Google Apps Script** reads the Sheet and returns it as JSON (read-only).
- **HTML + CSS + JavaScript** show the dashboard.
- **GitHub Pages** hosts the website for free.

Edit the Google Sheet → click **Refresh Data** on the website → you see the change. You never upload student data to GitHub and you never redeploy GitHub Pages when the data changes.

---

## Contents

1. [What the application does](#1-what-the-application-does)
2. [Architecture](#2-architecture)
3. [Files](#3-files)
4. [Google Sheet requirements](#4-google-sheet-requirements)
5. [Setup — step by step](#5-setup--step-by-step)
6. [Live update check](#6-live-update-check)
7. [API documentation](#7-api-documentation)
8. [Changing settings later](#8-changing-settings-later)
9. [Troubleshooting](#9-troubleshooting)
10. [Security and privacy — please read](#10-security-and-privacy--please-read)
11. [Maintenance](#11-maintenance)

---

## 1. What the application does

**Dashboard page**

- KPI cards: Total Students, Total Schools, Total Districts, Total Exam Centres, JEE/NEET Students.
- Filters: District, School, Exam Centre, Scholarship, JEE/NEET, Code (all built from the Sheet; combined with AND logic) and **Reset Filters**.
- Search across Roll No, Name, School, Code, District and Exam Centre (partial, case-insensitive, ignores punctuation — "St Mary" finds "St. Mary's").
- Summary tables: Students by District, School, Exam Centre, Scholarship, and JEE/NEET.
- Student table with sorting, pagination (50 per page), row count, sticky header and horizontal scrolling on phones. Copy to Excel and Export CSV of the filtered list.

KPIs, summaries and the table all follow the current filters and search.

**Schools page**

- Searchable "Select School" dropdown (A→Z, built from the Sheet).
- School statistics: Students in School, Average Total, Top Rank, JEE Count, NEET Count, Scholarship Count.
- The school's student table (sortable, paginated).
- **Copy to Excel** — copies the whole school table (all pages) as tab-separated text you paste straight into Excel or Google Sheets.
- **Export CSV** — downloads the same table as a `.csv` file.

**Everywhere**

- **Refresh Data** fetches the latest data from the Sheet and rebuilds everything.
- "Last Updated" shows when the server actually read the Sheet.
- Loading, error and "no data" messages — the page is never blank. Blank cells show `—` (never `0`, `undefined`, `null` or `NaN`).

---

## 2. Architecture

```text
Google Sheet  (database)
      ↓
Google Apps Script  (read-only JSON API, doGet)
      ↓
JSON over HTTPS
      ↓
HTML + CSS + JavaScript  (runs in the visitor's browser)
      ↓
GitHub Pages  (free static hosting)
      ↓
Live website  https://USERNAME.github.io/student-dashboard/
```

The website downloads the full dataset **once** (on page load or when you click Refresh Data) and keeps it in memory. All filtering, searching, sorting and school selection then happen instantly in the browser — the Sheet is not called again for each filter change.

---

## 3. Files

```text
student-dashboard/          ← upload these 4 files to GitHub
├── index.html              page structure
├── style.css               design
├── script.js               all website logic  (API_URL setting is at the top)
└── README.md               this guide

google-apps-script/         ← do NOT upload; paste into Apps Script instead
└── Code.gs                 the JSON API  (SPREADSHEET_ID and SHEET_NAME at the top)
```

You only ever edit **one setting in `script.js`** (`API_URL`) and **two settings in `Code.gs`** (`SPREADSHEET_ID`, `SHEET_NAME`).

---

## 4. Google Sheet requirements

Row 1 must be the header row. The columns are:

| # | Header | # | Header |
|---|--------|---|--------|
| 1 | Sl No | 9 | Exam Centre |
| 2 | Roll No | 10 | Scholarship |
| 3 | Name | 11 | JEE/NEET |
| 4 | PHY | 12 | District |
| 5 | CHE | 13 | School |
| 6 | MATH/BIO | 14 | Code |
| 7 | Total | 15 | District |
| 8 | Rank | | |

Notes:

- **Two "District" columns are fine.** The script names them `District` and `District 2`. The website uses the first one; if it is blank for a row, it uses the second one.
- Column order does not matter — columns are matched by header name. Small spelling differences are accepted (e.g. `Sl. No`, `Exam Center`, `Maths/Bio`).
- Rows are detected automatically — add as many as you like. Completely empty rows are ignored. Rows with no Name **and** no Roll No (e.g. only a pre-filled Sl No) are also ignored.
- The script reads values **exactly as displayed** in the Sheet (so `50%` stays `50%`).
- JEE/NEET: any value containing "JEE" counts as JEE, any value containing "NEET" counts as NEET.
- Scholarship: any value counts as a scholarship except blank, `No`, `Nil`, `None`, `N/A`, `NA`, `-`, `0`, `0%`, `Not eligible`.
- If a column is missing, the website shows a yellow warning and uses `—` for that column.

---

## 5. Setup — step by step

### STEP 1 — Prepare the Google Sheet

1. Open the Google Sheet.
2. Check that **row 1 contains the headers** listed above.
3. Look at the tab name at the bottom-left (for example `Sheet1`). Write it down **exactly** — capital letters and spaces matter.
4. Make sure the required columns exist (at least Name or Roll No; ideally all 15).
5. You do not need to change your data. The script never edits the Sheet.
6. Copy the **Spreadsheet ID** from the address bar. The URL looks like:

   ```text
   https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit#gid=0
   ```

   The ID is the long part **between `/d/` and `/edit`**, for example `1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdE`.

### STEP 2 — Create the Google Apps Script

1. In the Google Sheet, click **Extensions → Apps Script**. A new tab opens.
2. Delete the sample code (`function myFunction() {}`) in `Code.gs`.
3. Open the provided `Code.gs`, copy **everything**, and paste it in.
4. At the top, in the CONFIGURATION section, set:

   ```javascript
   const SPREADSHEET_ID = "1AbCdEfGh...your id...";
   const SHEET_NAME = "Sheet1";   // your exact tab name
   ```

   (If you opened Apps Script from the Sheet itself, you may leave `SPREADSHEET_ID` as the placeholder — the script will then use that Sheet. Setting the ID is still recommended.)

5. Click the **Save** icon (💾) or press Ctrl+S / Cmd+S.
6. In the toolbar, choose the function **`testApi`** from the dropdown and click **Run**.
7. **Approve permissions** — the first time, Google asks:
   - "Authorization required" → click **Review permissions**.
   - Choose your Google account.
   - You may see **"Google hasn't verified this app"**. This is normal for your own scripts. Click **Advanced** → **Go to (your project name) (unsafe)**.
   - Click **Allow**. The script asks to *see* your spreadsheets; it only reads.
8. Open **Execution log** at the bottom. You should see `Sheet read OK. Students: …` and the column list. If you see an error, see [Troubleshooting](#9-troubleshooting).

### STEP 3 — Deploy the Apps Script as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon ⚙ next to "Select type" → choose **Web app**.
3. Fill in:
   - **Description:** `Student dashboard API` (anything).
   - **Execute as:** **Me** (your email).
     *Why:* the script reads the Sheet using your permission, so website visitors do not need access to the Sheet and can never edit it.
   - **Who has access:** **Anyone**.
     *Why:* the website runs in visitors' browsers without a Google login. With "Anyone with a Google account" or "Only myself", the browser gets a login page instead of JSON and the website shows "Unable to connect".
4. Click **Deploy**. Approve permissions again if asked.
5. Copy the **Web app URL**. It looks like:

   ```text
   https://script.google.com/macros/s/AKfycbx...long...code/exec
   ```

   It must end with **`/exec`** (not `/dev`).

> **Google Workspace accounts (e.g. a company domain):** your admin may hide the "Anyone" option and show only "Anyone within *your organisation*". That option will not work for a public website. Ask your admin to allow it, or deploy from an account where "Anyone" is available. Read [Section 10](#10-security-and-privacy--please-read) first.

### STEP 4 — Test the API in a browser

Paste each of these into the browser's address bar (replace with your URL):

```text
YOUR_APPS_SCRIPT_URL?action=data
YOUR_APPS_SCRIPT_URL?action=schools
YOUR_APPS_SCRIPT_URL?action=dashboard
YOUR_APPS_SCRIPT_URL?action=school&school=ABC%20Public%20School
```

You should see text starting with `{"success":true,...`. Common results:

| You see | Meaning | Fix |
|---|---|---|
| `{"success":true, ...}` | Working | Continue |
| `{"success":false,"error":"Sheet \"Sheet1\" not found..."}` | Wrong tab name | Fix `SHEET_NAME`, then redeploy a new version (Section 8) |
| `{"success":false,"error":"Could not open the spreadsheet..."}` | Wrong ID or no access | Fix `SPREADSHEET_ID` |
| A Google sign-in page | Access is not "Anyone" | Manage deployments → edit → Who has access: Anyone |
| "Script function not found: doGet" | Code not saved before deploying | Save, then deploy a new version |
| "Authorization is required" | Permissions not approved | Run `testApi` in the editor and approve |

### STEP 5 — Connect the website to the API

1. Open `script.js` in any text editor (Notepad, TextEdit, VS Code).
2. Near the top find:

   ```javascript
   const API_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```

3. Replace the placeholder with your Web app URL, keeping the quotes:

   ```javascript
   const API_URL = "https://script.google.com/macros/s/AKfycbx.../exec";
   ```

4. Save. Do not add passwords, keys or tokens anywhere.

### STEP 6 — Test locally (optional but recommended)

Choose one:

- **Easiest:** double-click `index.html`. It usually works because Apps Script allows cross-origin requests. If you see "Unable to connect" here but the API works in Step 4, or Copy to Excel fails, use one of the options below — some browsers restrict pages opened as `file:///`.
- **VS Code:** install the **Live Server** extension → right-click `index.html` → **Open with Live Server**.
- **Python already installed?** In the folder containing `index.html`, run:

  ```text
  python -m http.server 8000
  ```

  then open `http://localhost:8000`. (Python is only used as a local file server for testing; it is not part of the app.)

Check that the dashboard loads, filters work, and a school can be selected.

### STEP 7 — Create the GitHub repository

1. Sign in at <https://github.com> (create a free account if needed).
2. Click **+** (top-right) → **New repository**.
3. Repository name: `student-dashboard`. Visibility: **Public** (free GitHub Pages needs a public repo on a free account). Click **Create repository**.
4. Click **uploading an existing file** (or **Add file → Upload files**).
5. Drag in **only these four files**:

   ```text
   index.html
   style.css
   script.js
   README.md
   ```

6. Click **Commit changes**.

**Do NOT upload:** Google Sheet exports (CSV/XLSX), `Code.gs`, credentials, passwords, service-account JSON files, private keys or tokens.

### STEP 8 — Enable GitHub Pages

1. In the repository, click **Settings → Pages** (left menu).
2. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/(root)**
3. Click **Save**.
4. Wait 1–2 minutes. Refresh the Pages settings screen — it shows "Your site is live at …". You can also check the **Actions** tab: a green tick on "pages build and deployment" means it deployed.

### STEP 9 — Your live website URL

```text
https://USERNAME.github.io/student-dashboard/
```

Replace `USERNAME` with your GitHub username. This URL is free — no paid domain is needed.

### STEP 10 — Test the live website

```text
[ ] Dashboard loads
[ ] KPI cards show correct values
[ ] District filter works
[ ] School filter works
[ ] Exam Centre filter works
[ ] Scholarship filter works
[ ] JEE/NEET filter works
[ ] Code filter works
[ ] Global search works
[ ] Student table works
[ ] Pagination works
[ ] Sorting works
[ ] Schools page works
[ ] Searchable school dropdown works
[ ] Selecting a school shows only its students
[ ] School statistics are correct
[ ] Copy to Excel works
[ ] CSV export works
[ ] Refresh button works
[ ] Mobile layout works
```

Tip: compare "Total Students" with the number of filled rows in the Sheet (the last Sl No).

---

## 6. Live update check

1. In the Google Sheet, change something obvious for one student — e.g. Total, Rank or Scholarship.
2. Google Sheets saves automatically.
3. Open the website and click **Refresh Data**.
4. The new value appears, and "Last Updated" shows the new time.

No GitHub upload or redeployment is needed.

**About the cache:** to stay fast, the API keeps a copy of the Sheet for 60 seconds (`CACHE_SECONDS` in `Code.gs`). Opening or reloading the page may show data up to 60 seconds old; the **Refresh Data** button always skips the cache and reads the Sheet immediately.

---

## 7. API documentation

Base URL: your Web App URL ending in `/exec`. All endpoints are `GET` and return JSON. Add `&fresh=1` to skip the 60-second cache.

Every successful response includes:

```json
{
  "success": true,
  "action": "data",
  "lastUpdated": "2026-09-29T12:35:00+05:30",
  "cached": false,
  "sheetName": "Sheet1",
  "headers": ["Sl No", "Roll No", "...", "District", "School", "Code", "District 2"],
  "warnings": []
}
```

Every error response looks like:

```json
{ "success": false, "error": "Sheet \"Sheet1\" not found. Tabs in this spreadsheet: \"Results\"..." }
```

(Apps Script always returns HTTP 200, so check `success`.)

### Data — `GET ?action=data`

- **Purpose:** every student row. This is what the website uses.
- **Parameters:** `action=data`, optional `fresh=1`.
- **Example request:** `YOUR_APPS_SCRIPT_URL?action=data`
- **Example response:**

```json
{
  "success": true,
  "lastUpdated": "2026-09-29T12:35:00+05:30",
  "totalRows": 2350,
  "skippedRows": 0,
  "data": [
    {
      "Sl No": "1", "Roll No": "1001", "Name": "Student Name",
      "PHY": "85", "CHE": "82", "MATH/BIO": "90", "Total": "257", "Rank": "15",
      "Exam Centre": "Kozhikode", "Scholarship": "50%", "JEE/NEET": "JEE",
      "District": "Kozhikode", "School": "ABC School", "Code": "SCH001",
      "District 2": "Kozhikode"
    }
  ]
}
```

All values are strings exactly as shown in the Sheet; blank cells are `""`.

### Schools — `GET ?action=schools`

- **Purpose:** unique school list, A→Z, with student counts.
- **Parameters:** `action=schools`.
- **Example request:** `YOUR_APPS_SCRIPT_URL?action=schools`
- **Example response:**

```json
{
  "success": true,
  "totalSchools": 312,
  "schools": [
    { "school": "ABC Public School", "code": "SCH002", "district": "Ernakulam", "students": 48 }
  ]
}
```

### Dashboard — `GET ?action=dashboard`

- **Purpose:** KPI numbers and summary tables for the whole Sheet (no filters).
- **Parameters:** `action=dashboard`.
- **Example request:** `YOUR_APPS_SCRIPT_URL?action=dashboard`
- **Example response:**

```json
{
  "success": true,
  "kpis": {
    "totalStudents": 2350, "totalSchools": 312, "totalDistricts": 14,
    "totalExamCentres": 28, "jeeNeetStudents": 1567, "jeeStudents": 783, "neetStudents": 784
  },
  "summaries": {
    "byDistrict":    [{ "name": "Malappuram", "count": 744 }],
    "bySchool":      [{ "name": "ABC Public School", "count": 48 }],
    "byExamCentre":  [{ "name": "Kochi Centre", "count": 784 }],
    "byScholarship": [{ "name": "25%", "count": 588 }],
    "byJeeNeet":     [{ "name": "NEET", "count": 784 }]
  }
}
```

### School — `GET ?action=school&school=<encoded-school-name>`

- **Purpose:** one school's students and statistics. Matching ignores case and extra spaces.
- **Parameters:** `action=school`, `school` (URL-encoded: spaces → `%20`, `'` → `%27`).
- **Example request:** `YOUR_APPS_SCRIPT_URL?action=school&school=ABC%20Public%20School`
- **Example response:**

```json
{
  "success": true,
  "school": "ABC Public School",
  "totalRows": 48,
  "message": "",
  "stats": { "students": 48, "averageTotal": 212.4, "topRank": 3, "jee": 20, "neet": 25, "scholarship": 12 },
  "data": [ { "Sl No": "4", "Roll No": "1004", "Name": "..." } ]
}
```

If no students match, `totalRows` is `0`, `data` is `[]`, and `message` explains why.

---

## 8. Changing settings later

**Any change to `Code.gs` needs a new version to go live:**
**Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy.** The URL stays the same, so `script.js` needs no change. (Creating a *New deployment* instead gives a *new* URL, which you would then have to paste into `script.js`.)

- **Changing the Sheet (tab) name:** update `SHEET_NAME` in `Code.gs` → save → deploy a new version.
- **Using a different spreadsheet:** update `SPREADSHEET_ID` → save → run `testApi` (approve if asked) → deploy a new version.
- **Hiding a column from the website:** add it to `HIDDEN_COLUMNS`, e.g. `["Phone", "Parent Name"]` → deploy a new version. Hidden columns are never sent by the API.
- **Changing the cache time:** `CACHE_SECONDS` (0 disables it).
- **Changing the API URL on the website:** edit `API_URL` in `script.js` and upload the new `script.js` to GitHub (Add file → Upload files → replace).
- **Rows per page:** `PAGE_SIZE` in `script.js`.

---

## 9. Troubleshooting

### API not loading
Open `YOUR_APPS_SCRIPT_URL?action=data` in a browser. If that shows an error, fix it using the table in Step 4. If it shows JSON, the problem is in the website: check `API_URL` in `script.js` (quotes, full URL, ends in `/exec`).

### Failed to fetch
The browser could not reach the API. Causes: no internet; wrong `API_URL`; deployment access not set to **Anyone**; a browser extension or school/office network blocking `script.google.com`. Try the API URL directly in the same browser.

### CORS error
In the browser console (F12 → Console) you may see "blocked by CORS policy". With Apps Script this almost always means Google returned a **login or error page instead of JSON** — i.e. access is not **Anyone**, you used the `/dev` URL, or the deployment was deleted. Fix the deployment; do not try to add custom headers in `script.js` (that breaks Apps Script requests).

### Apps Script permission error
"Authorization is required" or "You do not have permission to call SpreadsheetApp.openById": open the Apps Script editor, run `testApi`, approve all prompts, then deploy a new version. Make sure the account that deployed the script can open the Sheet.

### Sheet not found
The error lists the tab names that exist. Copy one exactly into `SHEET_NAME` (watch for trailing spaces), save, deploy a new version.

### School dropdown empty
The Sheet has no `School` column (check the yellow warning — the header must be spelled `School`) or the School cells are blank. Check `?action=schools`.

### Dashboard blank
You should always see either the loading spinner, an error box or the dashboard. If the page is completely white: make sure `index.html`, `style.css` and `script.js` are in the same folder with exactly these names (lower-case); press F12 → Console to see JavaScript errors; if you edited `script.js`, check you didn't delete a quote or bracket around `API_URL`.

### Data not updating
Click **Refresh Data** (page reloads may show cached data up to 60 s old). If still old: open `?action=data&fresh=1` and see whether the change is there. If not, you may be editing a different spreadsheet or tab than `SPREADSHEET_ID`/`SHEET_NAME`. If you changed `Code.gs`, deploy a **new version**.

### GitHub Pages 404
Wait 2–3 minutes after enabling Pages. Check the URL is `https://USERNAME.github.io/student-dashboard/` (repository name, with the trailing `/`). Make sure `index.html` is at the **root** of the repository, not inside a subfolder, and Pages is set to `main` / `/(root)`.

### Copy to Excel not working
Clipboard access needs a secure page (`https://` — GitHub Pages is fine — or `localhost`). If the button says "Copy failed", the browser blocked the clipboard: allow clipboard permission for the site, try another browser, or use **Export CSV**. When pasting into Excel, click a single cell (e.g. A1) and press Ctrl+V. Excel may drop leading zeros from numbers such as Roll No `00123`; format those columns as Text before pasting if needed.

---

## 10. Security and privacy — please read

**What this setup does protect:**

- No passwords, keys, tokens or Google credentials are stored in the website or on GitHub. The only setting in the website is the public Web App URL.
- Visitors cannot edit the Google Sheet. The script only reads, and it runs with your permission ("Execute as: Me"). The Sheet itself can stay private (not shared).
- The Sheet file is never uploaded to GitHub.
- Columns listed in `HIDDEN_COLUMNS` are never sent out.

**What it does NOT protect — important:**

- With "Who has access: **Anyone**", **anyone who has or finds the API URL can download all the data the API returns.** The URL is visible to anyone who opens the website and looks at `script.js`.
- GitHub Pages sites on free accounts are **public**. Anyone with the website link can see the dashboard.
- An obscure URL is **not** security. A "secret token" written into `script.js` would also be public, so this project deliberately does not use one.

**Therefore:** use this setup only when the student data is **authorised to be shown** to everyone who could get the link (for example, published results). Remove any column that should not be public (phone numbers, addresses, parent names) using `HIDDEN_COLUMNS`, or keep such data in a separate tab/sheet.

If the dashboard must be restricted to authorised staff, this architecture is not enough — you need a login-protected backend (for example, an Apps Script web app with "Anyone with a Google account"/domain-only access served from Apps Script's own HTML service, or another authenticated hosting option). Do not treat a public Apps Script endpoint as private.

**Optional hardening:** in Apps Script → Project Settings → tick "Show appsscript.json manifest file", then add `"oauthScopes": ["https://www.googleapis.com/auth/spreadsheets.readonly"]` to `appsscript.json` so the script can only ever read spreadsheets. Re-run `testApi`, approve, and deploy a new version.

---

## 11. Maintenance

- **Day to day:** just edit the Google Sheet. Keep the header row unchanged. Add/remove rows freely.
- **Adding a new column** to the Sheet does no harm; the website ignores columns it doesn't know. (It will still be sent by the API — use `HIDDEN_COLUMNS` if it's private.)
- **Renaming a header** used by the website (e.g. "School") breaks that feature; the yellow warning will tell you which column is missing.
- **Updating the website design/code:** edit the file, upload it to GitHub (replace the old one). GitHub Pages redeploys in about a minute. Press Ctrl+F5 to bypass your browser cache.
- **Updating Code.gs:** always deploy a **new version** (Section 8).
- **Large sheets:** tested design target is a few thousand rows. Very large sheets (tens of thousands of rows) still work but take longer to load; consider splitting by year.
- **Google quotas:** Apps Script free accounts allow plenty of reads for a school dashboard; the 60-second cache reduces load further.
