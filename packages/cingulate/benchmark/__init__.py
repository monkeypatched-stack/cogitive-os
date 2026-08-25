"""Benchmark — testing and validation framework.

Provides:
- BenchmarkRunner: executes benchmarks
- ScenarioRunner: runs end-to-end scenarios
- ResultValidator: validates results
- ReportGenerator: generates reports
"""

from cingulate.benchmark.runner import BenchmarkRunner, BenchmarkResult
from cingulate.benchmark.scenario_runner import ScenarioRunner, ScenarioResult
from cingulate.benchmark.validator import ResultValidator, ValidationResult
from cingulate.benchmark.reporter import ReportGenerator

__all__ = [
    "BenchmarkRunner",
    "BenchmarkResult",
    "ScenarioRunner",
    "ScenarioResult",
    "ResultValidator",
    "ValidationResult",
    "ReportGenerator",
]
