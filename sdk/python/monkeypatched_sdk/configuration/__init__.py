"""Configuration management – YAML loading, env overrides, secret injection."""

from .manager import AdapterConfig, ConfigurationManager

__all__ = ["ConfigurationManager", "AdapterConfig"]
