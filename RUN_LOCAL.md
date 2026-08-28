# Run ARGO Marketplace Management System Locally

This guide starts the project from a complete local folder. It supports both the immediate UI demo and the Supabase-backed API.

> Important: this folder includes a local `backend/.env` file for the configured database. It contains sensitive credentials, is ignored by Git, and must only be shared through a trusted channel. Do not commit it, upload it publicly, or include it in a public repository archive.

## 1. Required software

Install these before starting:

- Node.js **22.20 LTS**
- Python **3.11.9**
- Git (optional for running, required for source control)

Confirm the versions in PowerShell:

```powershell
node --version
py -3.11 --version
```

## 2. Fastest option: run the UI demo

This is the recommended option for a client presentation. It uses the realistic ARGO demo data already packaged in the frontend and does not need the database or API.

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL shown by Vite, normally:

```text
http://localhost:5173/dashboard
```

The frontend uses the Supabase-backed API by default. The public customer landing page is `/`, the customer catalog is `/marketplace`, the seller workspace is `/seller`, and the admin portal is `/dashboard`. Set `VITE_API_MODE=mock` only for isolated UI development.

## 3. Supabase-backed API setup

Use this path when checking the FastAPI service, database migrations, and persisted ARGO demo tenant.

1. Confirm `backend/.env` exists. It should already be present in this handoff folder.

   ```powershell
   Test-Path backend\.env
   ```

   The result must be `True`. Do not print its contents in a shared terminal, screenshot, ticket, or chat.

2. Create and activate the Python environment.

   ```powershell
   cd backend
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -e ".[dev]"
   ```

3. Apply the database schema.

   ```powershell
   alembic upgrade head
   ```

4. Load the ARGO demo tenant.

   ```powershell
   python -m app.seed
   ```

   This replaces data only for the project's dedicated ARGO demo organization. Do not run the seed against a production organization.

5. Start FastAPI.

   ```powershell
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

6. Verify the API in a second PowerShell window.

   ```powershell
   Invoke-RestMethod http://127.0.0.1:8000/api/health
   ```

   Expected result:

   ```text
   status  : ok
   service : argo-marketplace-api
   ```

The interactive API documentation is available at:

```text
http://127.0.0.1:8000/docs
```

## 4. Frontend API mode

The default frontend is deliberately kept in mock mode for the most reliable visual demo. To exercise API reads locally, create `frontend/.env.local` with:

```dotenv
VITE_API_MODE=api
VITE_API_URL=http://127.0.0.1:8000
```

Then restart `npm run dev` from the `frontend` folder.

Do not place Supabase passwords, service-role keys, JWT signing keys, or database URLs in `frontend/.env.local`; browser environment variables are not secret.

The second migration adds seller applications, order lines, customer order ownership, payment state, and the commission ledger. Run `alembic upgrade head` before testing checkout, seller orders, seller balances, or admin commission controls. The seeded local tenant includes realistic seller applications and commission examples.

Payment selection is implemented as a safe order/payment state flow. Cash, GCash, PayMaya, and bank transfer are recorded as pending until a payment provider or finance verification integration is connected. No real money is moved by the local demo.

## 5. Validation commands

Run these before a handoff or deployment.

```powershell
cd frontend
npm run lint
npm run test -- --run
npm run build

cd ..\backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\ruff.exe check .
```

## 6. Common issues

| Symptom | Resolution |
| --- | --- |
| `node` or `py -3.11` is not found | Install the required version and reopen PowerShell. |
| Port 5173 is already in use | Stop the old Vite terminal, or use the alternate URL Vite prints. |
| Port 8000 is already in use | Stop the previous FastAPI process, or run Uvicorn on another port and update `VITE_API_URL`. |
| Database connection fails | Verify that `backend/.env` exists, is private, and has valid access. Do not paste its value into public channels. |
| Page shows old data after changing environment files | Stop and restart the Vite dev server. |

## 7. Safe client handoff

For a private client transfer, include the full project folder and its `backend/.env` only through an approved secure channel. For a public repository or public zip, exclude `backend/.env` and ask the recipient to create it from `backend/.env.example` with their own credentials.
