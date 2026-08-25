"""MonkeyBrain Cerebellum — Capability framework.

The Cerebellum provides:
- Capability base class and manifest
- Capability registry for discovery and management
- Peripheral abstraction for I/O
- Lifecycle management
- Fallback engine for graceful degradation
- Secure keystore for API keys
"""

from cerebellum.capability import Capability, CapabilityManifest
from cerebellum.registry import Registry as CapabilityRegistry
from cerebellum.descriptor import CapabilityDescriptor, ProviderBinding
from cerebellum.graph import CapabilityGraph
from cerebellum.bus import CapabilityBus, CapabilityResult
from cerebellum.peripheral import Peripheral
from cerebellum.lifecycle import ICapabilityLifecycle as CapabilityLifecycle
from cerebellum.metadata import CapabilityMetadata
from cerebellum.config import CapabilityConfig as CerebellumConfig
from cerebellum.fallback_engine import FallbackEngine
from cerebellum.keystore import SecureKeystore
from cerebellum.key_manager import KeyManager

__version__ = "1.0.0"

__all__ = [
    "Capability",
    "CapabilityManifest",
    "CapabilityRegistry",
    "CapabilityDescriptor",
    "ProviderBinding",
    "CapabilityGraph",
    "CapabilityBus",
    "CapabilityResult",
    "Peripheral",
    "CapabilityLifecycle",
    "CapabilityMetadata",
    "CerebellumConfig",
    "FallbackEngine",
    "SecureKeystore",
    "KeyManager",
]
