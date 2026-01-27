# Model Configuration

MobausStudio supports multiple AI models. This article introduces how to configure and manage models.

## Supported Models

### OpenAI

- GPT-4o
- GPT-4 Turbo
- GPT-4
- GPT-3.5 Turbo

### Anthropic

- Claude 3.5 Sonnet
- Claude 3 Opus
- Claude 3 Sonnet
- Claude 3 Haiku

### Other Compatible Models

Any model compatible with OpenAI API format:

- Azure OpenAI
- Locally deployed open-source models (via Ollama, LM Studio, etc.)
- Other third-party API services

---

## Configuration Steps

### 1. Open Settings

Click the "⚙️ Settings" icon in the sidebar, select "Model Configuration".

### 2. Add API Key

#### OpenAI

1. Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
2. Create a new API Key
3. Copy the key and paste into MobausStudio's OpenAI API Key input

#### Anthropic

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create an API Key
3. Copy the key and paste into MobausStudio's Anthropic API Key input

### 3. Select Default Model

After configuration, select a default model to use.

---

## Custom API Endpoint

If you use a proxy or self-hosted service, you can configure a custom API endpoint:

### OpenAI Compatible Endpoint

```
https://your-proxy.com/v1
```

### Common Scenarios

| Scenario | Endpoint Configuration |
|----------|----------------------|
| OpenAI Official | `https://api.openai.com/v1` (default) |
| Azure OpenAI | `https://your-resource.openai.azure.com/` |
| Local Ollama | `http://localhost:11434/v1` |
| Third-party proxy | According to provider's address |

---

## Model Parameters

### Temperature

Controls randomness of replies:

- **0**: Most deterministic, suitable for code, factual Q&A
- **0.7**: Balanced (default)
- **1+**: More creative, suitable for creative writing

### Max Tokens

Limits maximum length of replies. Adjust as needed:

- Short answers: 500-1000
- Detailed explanations: 2000-4000
- Long text generation: 4000+

### Top P

Another parameter to control randomness, usually keep default value 1.

---

## Model Selection Recommendations

### Daily Conversation

Recommended: **GPT-3.5 Turbo** or **Claude 3 Haiku**

- Fast response
- Lower cost
- Sufficient for most conversations

### Complex Tasks

Recommended: **GPT-4o** or **Claude 3.5 Sonnet**

- Strong reasoning ability
- High code quality
- Understands complex instructions

### Long Text Processing

Recommended: **Claude 3** series

- Supports longer context
- Strong long text understanding

### Code Generation

Recommended: **GPT-4o** or **Claude 3.5 Sonnet**

- High code quality
- Supports multiple programming languages
- Can understand complex requirements

---

## Cost Information

Using AI models requires paying API fees, charged by model providers:

| Model | Approximate Cost (per million tokens) |
|-------|--------------------------------------|
| GPT-3.5 Turbo | $0.5 - $1.5 |
| GPT-4o | $2.5 - $10 |
| Claude 3 Haiku | $0.25 - $1.25 |
| Claude 3.5 Sonnet | $3 - $15 |

> 💡 Please refer to each provider's official website for specific costs, prices may change.

---

## Troubleshooting

### Invalid API Key

- Confirm key is copied completely without extra spaces
- Confirm key has not expired or been revoked
- Confirm account has sufficient balance

### Request Timeout

- Check network connection
- Try using a proxy
- Reduce Max Tokens in request

### Model Unavailable

- Confirm API endpoint is correct
- Confirm account has permission to use the model
- Check provider's status page

---

## Next Steps

- [MCP Services](./mcp.md) - Let AI use external tools
- [Skills System](./skills.md) - Use preset prompts
