"""Inbound authentication: the Cloudflare Access JWT on every request.

cloudflared only forwards requests Access has admitted to the lab-worker
hostname, and Access puts a signed JWT in `Cf-Access-Jwt-Assertion`. The agent
verifies it anyway against the team's JWKS and the application AUD, so a
misconfigured tunnel or policy cannot expose the job API (D-033).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import jwt
from jwt import PyJWKClient

from hivemind_worker.config import WorkerConfig

log = logging.getLogger(__name__)

HEADER = "Cf-Access-Jwt-Assertion"


@dataclass(slots=True)
class Principal:
    common_name: str | None
    email: str | None


class AccessVerifier:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self._jwks: PyJWKClient | None = None
        if not config.insecure and config.access_team_domain is not None:
            self._jwks = PyJWKClient(
                f"{config.access_team_domain.rstrip('/')}/cdn-cgi/access/certs",
                cache_keys=True,
                lifespan=3600,
            )

    def verify(self, token: str | None) -> Principal | None:
        if self.config.insecure:
            return Principal(common_name="insecure-local", email=None)
        if token is None or self._jwks is None or self.config.access_aud is None:
            return None
        try:
            key = self._jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["RS256"],
                audience=self.config.access_aud,
                issuer=self.config.access_team_domain,
                options={"require": ["exp", "iat"]},
            )
        except jwt.PyJWTError as error:
            log.warning("rejected Access token: %s", error)
            return None
        common_name = claims.get("common_name")
        email = claims.get("email")
        return Principal(
            common_name=str(common_name) if isinstance(common_name, str) else None,
            email=str(email) if isinstance(email, str) else None,
        )
