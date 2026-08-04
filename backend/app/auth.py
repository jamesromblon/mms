from __future__ import annotations

import json
import urllib.request
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from .config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthContext:
    subject: str
    organization_id: uuid.UUID
    roles: frozenset[str]


DEV_ORGANIZATION_ID = uuid.UUID("6c0e9b55-4f6d-4e60-90c5-8cf4c4f3f5a0")


def _dev_context(token: str | None) -> AuthContext:
    roles = {
        "dev-marketplace-admin": {"Marketplace Admin"},
        "dev-catalog-moderator": {"Catalog Moderator"},
        "dev-operations": {"Operations/Disputes"},
        "dev-finance": {"Finance/Payouts"},
    }.get(token or "", {"Marketplace Admin"})
    return AuthContext(subject="local-dev", organization_id=DEV_ORGANIZATION_ID, roles=frozenset(roles))


def _claim(payload: dict[str, Any], path: str, default: Any = None) -> Any:
    value: Any = payload
    for part in path.split("."):
        if not isinstance(value, dict):
            return default
        value = value.get(part, default)
    return value


def _jwks(settings: Settings) -> dict[str, Any]:
    with urllib.request.urlopen(settings.argo_jwt_jwks_url, timeout=5) as response:
        payload: Any = json.load(response)
        return payload if isinstance(payload, dict) else {}


def _verify_argo_token(token: str, settings: Settings) -> AuthContext:
    if not settings.argo_jwt_issuer or not settings.argo_jwt_audience or not settings.argo_jwt_jwks_url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ARGO JWT configuration is incomplete")
    try:
        header = jwt.get_unverified_header(token)
        key_data = next(key for key in _jwks(settings).get("keys", []) if key.get("kid") == header.get("kid"))
        payload = jwt.decode(token, key_data, algorithms=[header.get("alg", "RS256")], issuer=settings.argo_jwt_issuer, audience=settings.argo_jwt_audience)
        organization_id = uuid.UUID(str(_claim(payload, settings.argo_jwt_organization_claim)))
        raw_roles = _claim(payload, settings.argo_jwt_roles_claim, [])
        roles = frozenset(raw_roles if isinstance(raw_roles, list) else [str(raw_roles)])
        return AuthContext(subject=str(payload.get("sub", "unknown")), organization_id=organization_id, roles=roles)
    except (JWTError, KeyError, StopIteration, ValueError, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ARGO access token") from exc


def get_auth_context(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), settings: Settings = Depends(get_settings)) -> AuthContext:
    if settings.argo_auth_mode == "dev":
        return _dev_context(credentials.credentials if credentials else None)
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    return _verify_argo_token(credentials.credentials, settings)


def require_roles(*required_roles: str) -> Callable[..., AuthContext]:
    def dependency(context: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if "Marketplace Admin" in context.roles or context.roles.intersection(required_roles):
            return context
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient marketplace permissions")

    return dependency
