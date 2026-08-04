# Contributing to ARGO Marketplace Management System

Thank you for contributing. This guide keeps changes reviewable, secure, and consistent with the project architecture.

## Before you start

- Discuss significant scope changes in an issue before implementation.
- Use Node.js 22, Python 3.11, React 18, Tailwind CSS 3, React Router 6, Pydantic 2, SQLAlchemy 2, and PostgreSQL 14-compatible features only.
- Never add secrets, production data, exported database dumps, or generated dependency folders to Git.

## Development workflow

1. Create a focused branch from the default branch, for example `feature/payout-batch-filters`.
2. Make a small, cohesive change.
3. Add or update tests when behavior changes.
4. Run the relevant frontend and backend validation commands.
5. Open a pull request with a clear description, screenshots for UI work, and notes about any migration or environment changes.

## Code expectations

- Keep tenant scoping and role checks on every backend query and mutation.
- Use generated UUIDs for new database entities and use JSONB only for flexible structured attributes.
- Use Alembic migrations for schema changes; do not depend on `create_all` for production deployment.
- Keep UI loading, empty, error, and mobile states intentional.
- Make charts derive their scale and labels from their supplied data rather than fixed pixel or value assumptions.
- Keep controls accessible: semantic labels, keyboard-operable buttons, useful confirmation feedback, and clear destructive-action language.

## Validation

Run these checks before requesting review:

```powershell
cd frontend
npm run lint
npm run test -- --run
npm run build

cd ..\backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\ruff.exe check .
```

## Reporting security issues

Do not open public issues for credentials, authentication flaws, authorization bypasses, or data-exposure risks. Contact the repository owner privately with a concise reproduction and impact summary.
