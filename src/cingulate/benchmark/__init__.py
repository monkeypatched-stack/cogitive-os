"""Benchmark — testing and validation framework.

Provides:
- BenchmarkRunner: executes benchmarks
- ScenarioRunner: runs end-to-end scenarios
- ResultValidator: validates results
- ReportGenerator: generates reports
"""

from src.cingulate.benchmark.runner import BenchmarkRunner, BenchmarkResult
from src.cingulate.benchmark.scenario_runner import ScenarioRunner, ScenarioResult
from src.cingulate.benchmark.validator import ResultValidator, ValidationResult
from src.cingulate.benchmark.reporter import ReportGenerator

__all__ = [
    "BenchmarkRunner",
    "BenchmarkResult",
    "ScenarioRunner",
    "ScenarioResult",
    "ResultValidator",
    "ValidationResult",
    "ReportGenerator",
]
