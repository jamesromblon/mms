# ARGO Marketplace Management System

ARGO Marketplace Management System is a responsive operations workspace for managing a multi-seller marketplace. It covers catalog governance, orders, seller onboarding, reviews, disputes, payouts, and marketplace-wide policy settings.

The project provides a polished React demonstration interface and a FastAPI/PostgreSQL service with tenant isolation, role checks, migrations, and realistic ARGO Philippines seed data.

## Features

- Marketplace dashboard with responsive GMV, order-status, seller, category, dispute, and payout visualizations.
- Product catalog review, approval, archiving, search, filtering, export, and detail views.
- Order tracking and fulfillment-queue workflows.
- Seller directory, application review, and account status workflows.
- Review moderation, dispute resolution, payout batching, release, and settlement states.
- Category, commission, and dispute-policy administration.
- Organization-based tenancy and role-based API authorization.

## Technology

| Area | Technology |
| --- | --- |
| Frontend | Node.js 22, React 18, Vite 7, Tailwind CSS 3, React Router 6 |
| Data and UI | TanStack Query, Zustand, Axios, Recharts, Bootstrap Icons |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 |
| Database | PostgreSQL 14-compatible database with UUID and JSONB support |
| Quality | Vitest, ESLint, Pytest, Ruff, Mypy |

## Prerequisites

- Node.js 22.20 LTS
- Python 3.11.9
- PostgreSQL 14, or a compatible hosted PostgreSQL service
- Git

## Local setup

1. Clone the repository and install the frontend dependencies.

   ```powershell
   cd frontend
   npm install
   ```

2. Create a backend environment file from the example.

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

3. Set `DATABASE_URL` in `backend/.env` to a PostgreSQL connection string. For a hosted Supabase database, use the session-mode pooler for Alembic migrations and keep this file local.

4. Create the Python environment, migrate, and load the ARGO demo tenant.

   ```powershell
   cd backend
   py -3.11 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -e ".[dev]"
   alembic upgrade head
   python -m app.seed
   ```

5. Run the API.

   ```powershell
   uvicorn app.main:app --reload --port 8000
   ```

6. In another terminal, run the frontend.

   ```powershell
   cd frontend
   npm run dev
   ```

The frontend uses the high-fidelity mock dataset by default. To test the FastAPI service locally, create `frontend/.env.local` with:

```dotenv
VITE_API_MODE=api
VITE_API_URL=http://localhost:8000
```

## Environment and security

- Never commit `.env`, `.env.local`, database passwords, JWTs, service-role keys, or other credentials.
- Use the anonymous Supabase key only in an approved public client configuration. Service-role keys must remain server-side.
- Use `ARGO_AUTH_MODE=dev` only for local development. Configure ARGO JWT issuer, audience, JWKS URL, organization claim, and roles claim before deployment.
- The included demo seed replaces data only for the local ARGO demo tenant. Do not run it against a production tenant.

## Validation

```powershell
cd frontend
npm run lint
npm run test -- --run
npm run build

cd ..\backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\ruff.exe check .
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

## License

This project is licensed under the [MIT License](LICENSE).
