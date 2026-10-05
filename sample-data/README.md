# Sample data

> ## ⚠️ SYNTHETIC DATA ONLY – NO REAL PATIENT DATA / PHI
> Every file in this folder is fictional and was written for the hackathon. Names, dates,
> identifiers and results are invented. **Never add real patient data here**, even de-identified.

## Layout

| Path | Format | Contents |
|---|---|---|
| `patients/<id>.json` | JSON | 103 synthetic oncology patients: demographics, diagnosis, staging, biomarkers, treatments, labs, timeline events |
| `notes/<id>-*.md` | Markdown | Free-text clinical notes (MDT notes, letters) for extraction/reasoning demos |
| `trials.csv` | CSV | Synthetic clinical trials with simple eligibility criteria |
| `minimum-dataset-crc.md` | Markdown | Data definition (no patient data): UMC Utrecht minimum dataset for colorectal cancer, used for the "In six months" horizon |
| `hospitals.csv` | CSV | Public hospital directory context: location, oncology scope, specialisms, scale and source links |

## How the app uses it

- `backend/app/sample_data.py` lists and reads files in this folder (read-only, path-safe).
- The Copilot SDK agent gets tools `list_sample_data`, `read_sample_data` and `get_patient`
  (see `backend/app/agent/tools.py`), so **new files are usable by the agent without code changes**.
- `GET /api/sample-data` lists files; `GET /api/sample-data/{path}` returns one.

## Adding data

- Keep formats human-readable: JSON, Markdown or CSV.
- Patients: follow the shape of `patients/P-001.json`; ids look like `P-###`.
- Mark every new file as synthetic (a `"synthetic": true` field in JSON, or a note at the top).
- Keep individual files small (< 200 KB) so they fit comfortably into agent context.
- Hospital directory entries may describe real institutions, but must never contain patient data.
