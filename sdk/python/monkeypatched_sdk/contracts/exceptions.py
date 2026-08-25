"""
SDK Exception Hierarchy
=======================

All SDK exceptions inherit from AdapterError so callers can catch the
entire hierarchy with a single except clause when needed.
"""


class AdapterError(Exception):
    """Base exception for all SDK adapter errors."""


class AdapterInitializationError(AdapterError):
    """
    Raised inside initialize() when the adapter cannot start.

    Common causes: missing config, unreachable external system,
    invalid credentials.
    """


class AdapterExecutionError(AdapterError):
    """
    Raised inside execute() for unrecoverable execution failures.

    Prefer returning AdapterResponse.fail() over raising this
    unless the failure is truly unexpected.
    """


class HealthCheckError(AdapterError):
    """
    Raised when health_check() itself encounters an unexpected error
    (not when the external system is merely unhealthy – return False
    for that case).
    """


class ConfigurationError(AdapterError):
    """
    Raised when configuration is missing, malformed, or fails
    validation.
    """


class AdapterValidationError(AdapterError):
    """
    Raised by the @capability_adapter decorator when the decorated
    class does not satisfy the CapabilityAdapter contract.
    """


class ConnectionPoolExhausted(AdapterError):
    """
    Raised by ConnectionPool.acquire() when no connection becomes
    available within the configured timeout.
    """


class AuthenticationError(AdapterError):
    """
    Raised by auth handlers when authentication fails or a token
    cannot be refreshed.
    """
