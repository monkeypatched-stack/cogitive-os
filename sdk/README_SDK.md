# MonkeyBrain SDK

Python SDK for the MonkeyBrain Cognitive Operating System.

## Installation

```bash
pip install monkeypatched-sdk
```

## Quick Start

```python
from monkeypatched_sdk import MonkeyBrainClient

client = MonkeyBrainClient(base_url="http://localhost:8032")
result = await client.query("Show me batch records")
print(result)
```

## Features

- 46+ capabilities across 24 categories
- RL Policy with Bellman Q-learning
- Secure keystore with user-scoped encryption
- Full observability (tracing, metrics, logging)
- Fleet management support

## License

Proprietary
