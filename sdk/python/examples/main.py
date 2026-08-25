"""
SDK Startup / Shutdown – Reference main.py
===========================================

This file shows the minimal bootstrap needed to:
    1. Load configuration
    2. Create telemetry, event bus, lifecycle manager
    3. Import adapter modules (triggers @capability_adapter registration)
    4. Start the lifecycle manager
    5. Handle graceful shutdown on SIGINT / SIGTERM

Copy and adapt this file for your own adapter host process.
"""

import asyncio
import logging
import signal
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Import adapters FIRST so @capability_adapter decorators run and register
# all adapter classes into AdapterRegistry before LifecycleManager.startup()
# ---------------------------------------------------------------------------
import cmms_adapter  # noqa: F401  – registers CMMSAdapter
import databricks_adapter  # noqa: F401  – registers DataBricksJobAdapter
import mqtt_sensor_adapter  # noqa: F401  – registers MQTTSensorAdapter
import opcua_adapter  # noqa: F401  – registers OPCUASensorAdapter
import sap_adapter  # noqa: F401  – registers SAP adapters
from monkeypatched_sdk import (
    ConfigurationManager,
    EventBusAdapter,
    LifecycleManager,
    TelemetryManager,
)
from monkeypatched_sdk.telemetry.exporters import LoggingExporter

# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("sdk.main")


async def main() -> None:
    # -----------------------------------------------------------------------
    # 1. Configuration
    # -----------------------------------------------------------------------
    config_path = Path(__file__).parent.parent / "config.example.yaml"
    config = ConfigurationManager(config_path=str(config_path))

    # Apply log level from config
    logging.getLogger().setLevel(getattr(logging, config.log_level, logging.INFO))
    logger.info("Configuration loaded from %s.", config_path)

    # -----------------------------------------------------------------------
    # 2. Telemetry
    # -----------------------------------------------------------------------
    # Swap LoggingExporter for PrometheusExporter / InfluxExporter in prod
    telemetry = TelemetryManager(exporter=LoggingExporter())

    # -----------------------------------------------------------------------
    # 3. Event Bus
    # -----------------------------------------------------------------------
    # Pass the real platform event bus here when integrating with the platform.
    # For standalone mode, EventBusAdapter() with no args is a no-op.
    event_bus = EventBusAdapter(platform_event_bus=None)

    # -----------------------------------------------------------------------
    # 4. Lifecycle Manager
    # -----------------------------------------------------------------------
    lifecycle = LifecycleManager(
        config_manager=config,
        event_bus=event_bus,
        telemetry=telemetry,
        health_check_interval=config.health_check_interval,
    )

    # -----------------------------------------------------------------------
    # 5. Startup
    # -----------------------------------------------------------------------
    logger.info("Starting SDK lifecycle manager...")
    await lifecycle.startup()
    logger.info("All adapters running.  Press Ctrl+C to stop.")

    # -----------------------------------------------------------------------
    # 6. Run until shutdown signal
    # -----------------------------------------------------------------------
    stop_event = asyncio.Event()

    def _handle_signal(*_):
        logger.info("Shutdown signal received.")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            # Windows does not support add_signal_handler
            signal.signal(sig, _handle_signal)

    await stop_event.wait()

    # -----------------------------------------------------------------------
    # 7. Shutdown
    # -----------------------------------------------------------------------
    logger.info("Shutting down...")
    await lifecycle.shutdown()
    logger.info("SDK shut down cleanly.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
