# MonkeyBrain Broca

Autonomous agent for the MonkeyBrain Cognitive Operating System.

## Features

- **Agent** — autonomous query handler with capability discovery
- **AgentResponse** — structured response with intent, confidence, and metrics
- **Capability discovery** — automatic discovery of available capabilities
- **Pipeline routing** — intent classification and pipeline selection
- **Fallback engine** — graceful degradation with document/web search
- **Policy learning** — Bellman Q-learning for pipeline optimization

## Installation

```bash
pip install monkeybrain-broca

# With full dependencies
pip install monkeybrain-broca[full]
```

## Quick Start

```python
from broca import Agent, AgentResponse

agent = Agent(runtime=my_runtime)
response = await agent.handle("What is the status of line 1?")
print(response.answer)
```

## License

Proprietary
