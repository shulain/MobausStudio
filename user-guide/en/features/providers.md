# Provider Management

<!-- markdownlint-disable MD060 -->

Providers are the core feature of MobausStudio for connecting to AI services. Through provider management, you can easily connect to various AI services without manually configuring complex API settings.

## What is a Provider?

A provider is a source of AI services, such as OpenAI, Anthropic, Google, etc. Each provider offers different AI models. Once connected to a provider, you can use all models from that provider.

---

## Supported Providers

### Popular Providers

| Provider | Description | Authentication |
|----------|-------------|----------------|
| 🤖 OpenAI | GPT-4, GPT-4o, o1 models | OAuth Login / API Key |
| 🧠 Anthropic | Claude 3.5, Claude 3 series | OAuth Login / API Key |
| ✨ Google AI | Gemini 2.0, Gemini 1.5 series | OAuth Login / API Key |
| 🔍 DeepSeek | DeepSeek Chat, Reasoner | API Key |
| 🐙 GitHub Copilot | Access multiple models with Copilot subscription | OAuth Login |
| 🌐 OpenRouter | Unified API for multiple models | API Key |
| ⚙️ Custom | Custom OpenAI-compatible endpoint | API Key / No Auth |

### Other Providers

- ⚡ **Groq**: Ultra-fast inference
- 🚀 **xAI**: Grok series models
- 🌪️ **Mistral AI**: Mistral series models
- 🔷 **Cohere**: Command series models
- 🤝 **Together AI**: Open source model hosting
- 🎆 **Fireworks AI**: High-performance inference
- 🔮 **Perplexity**: Search-enhanced AI
- 🧩 **Cerebras**: Ultra-fast inference

### Enterprise/Cloud Services

| Provider | Description |
|----------|-------------|
| ☁️ Azure OpenAI | Microsoft Azure hosted |
| 🏔️ AWS Bedrock | AWS hosted multiple models |
| 🔺 Google Vertex AI | Google Cloud enterprise AI |

### Local Services

| Provider | Description |
|----------|-------------|
| 🦙 Ollama | Run open source models locally |
| 🎬 LM Studio | Local model desktop app |

---

## Connecting Providers

### Method 1: OAuth Login (Recommended)

Some providers support OAuth login, which is the easiest way to connect:

1. Click the "🔌 Providers" icon in the sidebar
2. Find the provider you want to connect, click "Connect"
3. Select "OAuth Login" method
4. Click "Start Authorization", browser will open automatically
5. Log in to your account and authorize in the browser
6. After authorization, you'll be returned to the app automatically

**Providers supporting OAuth:**

- OpenAI (using ChatGPT Plus/Pro subscription)
- Anthropic (using Claude Pro/Max subscription)
- Google AI (using Google account)
- GitHub Copilot (using GitHub account)

> 💡 **Tip**: OAuth login handles authentication automatically, no need to manually copy API Keys.

### Method 2: API Key

1. Click the "🔌 Providers" icon in the sidebar
2. Find the provider you want to connect, click "Connect"
3. Select "API Key" method
4. Enter your API Key
5. Click "Connect"

**Getting API Key:**

- Click "Get API Key" link to open the provider's website
- Create an API Key on the website and copy-paste it

### Method 3: Environment Variables

Some enterprise providers support configuration via environment variables:

1. Set the required environment variables in your system
2. Restart MobausStudio
3. The app will automatically detect and connect

### Method 4: Custom Provider (OpenAI-Compatible)

If you use an internal gateway, proxy service, or private endpoint, use **Custom**:

1. Select **Custom** in the provider list
2. Enter API Endpoint (for example `https://your-endpoint/v1`)
3. Fill API Key only if your service requires it
4. Click **Test Connection** before saving

> 💡 **Tip**: Testing connection first helps you find configuration issues quickly.

---

## Managing Providers

### View Connection Status

On the providers page, you can see:

- **Connected**: Shows green indicator, you can use models from this provider
- **Disconnected**: Shows gray indicator, needs to be connected first
- **Error**: Shows red indicator, need to check credentials

### Google Model Quota View (New in v0.7.0)

After connecting to Google provider, you can view quota usage for each model in the provider card:

1. Find the connected Google provider card
2. Click "📊 Model Quota" to expand the quota panel
3. View remaining quota percentage for each model
4. Models with exhausted quota will show red warning

> 💡 **Tip**: Click "Refresh" button to get the latest quota information.

### Disconnect

1. Find the connected provider
2. Click "Disconnect" button
3. Confirm disconnection

> ⚠️ After disconnecting, conversations using models from this provider will not be able to continue.

### Search and Filter

- Use the search box to quickly find providers
- Use status filter to view connected/disconnected providers

---

## Relationship Between Providers and Models

After connecting a provider, models from that provider become available:

1. Connect a provider (e.g., OpenAI)
2. Add specific models on the "Models" page (e.g., GPT-4o)
3. Select and use the model in conversations

> 💡 **Tip**: One provider can have multiple models. You can add different model configurations as needed.

---

## FAQ

### OAuth Authorization Failed

- Make sure browser is not blocking pop-ups
- Check if network connection is normal
- Try manually copying the authorization link to browser

### Invalid API Key

- Confirm Key is copied completely without extra spaces
- Confirm Key has not expired or been revoked
- Confirm account has sufficient balance

### Local Service Connection Failed

- Confirm Ollama or LM Studio is running
- Check if port is correct (Ollama default 11434, LM Studio default 1234)

---

## Next Steps

- [Model Configuration](./models.md) - Add and configure specific models
- [Chat](./chat.md) - Start AI conversations
