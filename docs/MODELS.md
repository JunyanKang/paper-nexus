# Model catalogue and provider integration

Official documentation checked on 2026-10-06. Catalogue version: `2026-10-06.2`.

The catalogue stores API identifiers. A provider's public product name is not necessarily a valid API identifier. DeepSeek's versioned product name is therefore displayed alongside its callable alias; the request continues to use the alias. Presets are translation defaults, not a claim that every preset is the newest model.

| Provider | Translation default | Official reference |
|---|---|---|
| MiniMax | MiniMax-M2.7-highspeed | [Text generation](https://platform.minimax.cn/docs/guides/text-generation) |
| DeepSeek | deepseek-flash → V4.1 Flash | [Models and pricing](https://api-docs.deepseek.com/quick_start/pricing/) |
| Qwen | qwen3.8-flash | [Model catalogue](https://help.aliyun.com/zh/model-studio/models) |
| Doubao | doubao-seed-2-1-lite-260915 | [Model parameters](https://docs.volcengine.com/docs/ark/model-parameter-support?lang=zh) |
| GLM | glm-4.7-flash | [GLM 5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3) |
| Kimi | kimi-k2.6 | [API configuration](https://platform.kimi.com/docs/get-api-key) |
| Hunyuan | hy3 | [HY3](https://cloud.tencent.com/document/product/1823/130051) |
| Qianfan | ernie-4.5-turbo-128k | [API models](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y) |
| OpenAI | gpt-4.1-mini-2025-04-14 | [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1) |
| Anthropic | claude-haiku-4-5-20251001 | [Models overview](https://platform.claude.com/docs/en/models/overview) |
| Gemini | gemini-3.5-flash-lite | [Model catalogue](https://ai.google.dev/gemini-api/docs/models) |

The OpenAI presets use fixed snapshots supported by the current adapter. MiniMax's plan-only preview is not a general API default. GLM 5.3 keeps thinking enabled; Kimi K3 uses low reasoning effort for translation. Manual model IDs and endpoint overrides remain available.

## What “Update models” does

1. Fetch the public Paper Nexus catalogue anonymously. Reject untrusted endpoints, malformed IDs, rollback versions and same-version content changes.
2. For supported providers with a saved key, query the provider's own authenticated model-list endpoint. DeepSeek, OpenAI, Anthropic, Gemini, Kimi, Hunyuan and Qianfan use their documented list APIs; Anthropic pagination is followed.
3. Save a list only after all pages succeed. Keep the last list on failure. Exclude audio, image, embedding and other non-text models.
4. Report catalogue refresh and account-list refresh separately. Unsupported list APIs use the curated catalogue; they are not reported as live account queries.

[Gemini's compatible list API](https://ai.google.dev/gemini-api/docs/openai#list-models) is explicitly documented. [Qwen model discovery](https://help.aliyun.com/zh/model-studio/list-models) uses a different API and may require a workspace-specific endpoint. Qwen therefore uses the curated catalogue in this version; users of a workspace endpoint can enter its exact address. Saved keys are scoped to the exact provider and endpoint and are never moved to a new address by catalogue refresh.

Updating the catalogue does not change custom model IDs or relocate saved keys. Translation settings retain the account lists, endpoint, model and key. “Save & test” sends a small request for translation; it does not submit your library. Availability depends on the provider account and plan.

## Translation models

Choose an optional translation model in **Reading → AI settings**. Select a suggested model or type an exact API model ID. Literature networks use only the installed local models and local coauthor algorithms; they have no external-model configuration.

## Model-specific compatibility

Nexus selects request parameters for the chosen model, rather than applying one thinking switch to every model from a provider. MiniMax M3 can disable thinking, while M3.1 Preview cannot. Kimi K3 and GLM 5.3 always think. OpenAI and Kimi K3 use their documented completion-token limit. Custom models retain their provider defaults unless a model-specific rule is known.

Official protocol references: [MiniMax](https://platform.minimax.io/docs/api-reference/text-openai-api), [DeepSeek](https://api-docs.deepseek.com/guides/thinking_mode/), [Qwen](https://help.aliyun.com/zh/model-studio/deep-thinking), [Doubao](https://docs.volcengine.com/docs/ark/deep-thinking?lang=zh), [GLM](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3), [Kimi](https://platform.kimi.com/docs/guide/kimi-k3-quickstart), [Hunyuan](https://cloud.tencent.com/document/product/1823/130078), [Qianfan](https://intl.cloud.baidu.com/en/doc/qianfan/s/7m95lyy43-intl-en), [OpenAI](https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create), [Claude](https://platform.claude.com/docs/en/models/overview), [Gemini](https://ai.google.dev/gemini-api/docs/openai).

[Settings](SETTINGS.md) · [Network guide](NETWORK.md)
