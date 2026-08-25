"""Thin Resource-protocol wrappers around already-existing connection
objects (persistence adapters, GraphStore, SomaticCompiler, PCP's NATS
client, provider reachability checks) — translate their state into
ResourceHealth for src/monkey_brain/kernel/resource_manager.py's
ResourceManager, without reimplementing any connection logic.
"""
