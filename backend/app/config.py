from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://marketplace:marketplace@localhost:5432/argo_marketplace"
    direct_url: str | None = None
    argo_auth_mode: str = Field(default="dev", validation_alias="ARGO_AUTH_MODE")
    argo_jwt_issuer: str = ""
    argo_jwt_audience: str = ""
    argo_jwt_jwks_url: str = ""
    argo_jwt_organization_claim: str = "organization_id"
    argo_jwt_roles_claim: str = "roles"
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
