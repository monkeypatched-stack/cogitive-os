"""Shared Protocol abstractions for cross-package boundaries.

This module provides Protocol classes that break circular imports between
kernel and actor packages. Both packages import from here instead of
importing from each other directly.

Architecture Rule: No package should import from another package's
internal modules. All cross-package communication goes through Protocols.
"""
