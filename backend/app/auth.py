from __future__ import annotations

import json
import urllib.request
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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
    seller_id: uuid.UUID | None = None


DEV_ORGANIZATION_ID = uuid.UUID("6c0e9b55-4f6d-4e60-90c5-8cf4c4f3f5a0")


def _dev_context(token: str | None, settings: Settings) -> AuthContext:
    contexts = {
        "dev-marketplace-admin": ("local-admin", {"Marketplace Admin"}),
        "dev-catalog-moderator": ("local-moderator", {"Catalog Moderator"}),
        "dev-operations": ("local-operations", {"Operations/Disputes"}),
        "dev-finance": ("local-finance", {"Finance/Payouts"}),
        "dev-seller": ("local-seller", {"Seller"}),
        "dev-customer": ("local-customer", {"Customer"}),
    }
    if not settings.local_allow_legacy_tokens:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    if not token or token not in contexts:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid local demo access token")
    subject, roles = contexts[token]
    return AuthContext(subject=subject, organization_id=DEV_ORGANIZATION_ID, roles=frozenset(roles))


def create_local_access_token(
    subject: str,
    organization_id: uuid.UUID,
    roles: frozenset[str],
    seller_id: uuid.UUID | None,
    settings: Settings,
) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.local_access_token_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "organization_id": str(organization_id),
        "roles": list(roles),
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
        "iss": "argo-marketplace-local",
    }
    if seller_id:
        payload["seller_id"] = str(seller_id)
    return f"demo.{jwt.encode(payload, settings.local_auth_secret, algorithm='HS256')}"


def _verify_local_access_token(token: str, settings: Settings) -> AuthContext:
    try:
        raw_token = token.removeprefix("demo.")
        payload = jwt.decode(raw_token, settings.local_auth_secret, algorithms=["HS256"], issuer="argo-marketplace-local")
        organization_id = uuid.UUID(str(payload["organization_id"]))
        roles = frozenset(str(role) for role in payload.get("roles", []))
        raw_seller_id = payload.get("seller_id")
        seller_id = uuid.UUID(str(raw_seller_id)) if raw_seller_id else None
        if not roles:
            raise ValueError("Local token has no roles")
        return AuthContext(subject=str(payload["sub"]), organization_id=organization_id, roles=roles, seller_id=seller_id)
    except (JWTError, KeyError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid local access token") from exc


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
        raw_seller_id = _claim(payload, settings.argo_jwt_seller_claim)
        seller_id = uuid.UUID(str(raw_seller_id)) if raw_seller_id else None
        return AuthContext(
            subject=str(payload.get("sub", "unknown")),
            organization_id=organization_id,
            roles=roles,
            seller_id=seller_id,
        )
    except (JWTError, KeyError, StopIteration, ValueError, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid ARGO access token") from exc


def get_auth_context(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), settings: Settings = Depends(get_settings)) -> AuthContext:
    if settings.argo_auth_mode == "dev":
        if credentials and credentials.credentials.startswith("demo."):
            return _verify_local_access_token(credentials.credentials, settings)
        return _dev_context(credentials.credentials if credentials else None, settings)
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    return _verify_argo_token(credentials.credentials, settings)


def require_roles(*required_roles: str) -> Callable[..., AuthContext]:
    def dependency(context: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if "Marketplace Admin" in context.roles or context.roles.intersection(required_roles):
            return context
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient marketplace permissions")

    return dependency
