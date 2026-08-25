"""SittingFace — HuggingFace-style registry for MonkeyBrain somatic charts."""

__version__ = "1.0.0"

from sittingface.registry import SittingFaceRegistry, ChartMeta
from sittingface.client import SittingFaceClient
from sittingface.history import SomaticHistory, SomaticCommit, SomaticTag
from sittingface.vault import CodeVault, encrypt_generated_code, decrypt_generated_code

__all__ = [
    "SittingFaceRegistry",
    "SittingFaceClient",
    "SomaticHistory",
    "SomaticCommit",
    "SomaticTag",
    "CodeVault",
    "ChartMeta",
    "encrypt_generated_code",
    "decrypt_generated_code",
]
