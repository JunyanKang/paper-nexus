# Model catalogue and provider integration

Official documentation checked on 2026-10-06. Catalogue version: `2026-10-06.1`.

The catalogue stores API identifiers. A provider's public product name is not necessarily a valid API identifier. DeepSeek's versioned product name is therefore displayed alongside its callable alias; the request continues to use the alias. Presets are task defaults, not a claim that every preset is the newest model.

| Provider | Translation default | Research-topic default | Official reference |
|---|---|---|---|
| MiniMax | MiniMax-M2.7-highspeed | MiniMax-M3 | [Text generation](https://platform.minimax.cn/docs/guides/text-generation) |
| DeepSeek | deepseek-flash → V4.1 Flash | deepseek-v4-pro → V4 Pro-0813 | [Models and pricing](https://api-docs.deepseek.com/quick_start/pricing/) |
| Qwen | qwen3.8-flash | qwen3.7-plus | [Model catalogue](https://help.aliyun.com/zh/model-studio/models) |
| Doubao | doubao-seed-2-1-lite-260915 | doubao-seed-2-1-pro-260915 | [Model parameters](https://docs.volcengine.com/docs/ark/model-parameter-support?lang=zh) |
| GLM | glm-4.7-flash | glm-5.3 | [GLM 5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3) |
| Kimi | kimi-k2.6 | kimi-k3 | [API configuration](https://platform.kimi.com/docs/get-api-key) |
| Hunyuan | hy3 | hy3 | [HY3](https://cloud.tencent.com/document/product/1823/130051) |
| Qianfan | ernie-4.5-turbo-128k | ernie-5.0 | [API models](https://cloud.baidu.com/doc/qianfan-api/s/Dmba8k71y) |
| OpenAI | gpt-4.1-mini-2025-04-14 | gpt-4.1-2025-04-14 | [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1) |
| Anthropic | claude-haiku-4-5-20251001 | claude-sonnet-5-5 | [Models overview](https://platform.claude.com/docs/en/models/overview) |
| Gemini | gemini-3.5-flash-lite | gemini-3.8-flash | [Model catalogue](https://ai.google.dev/gemini-api/docs/models) |

The OpenAI presets use fixed snapshots supported by the current adapter. MiniMax's plan-only preview is not a general API default. GLM 5.3 keeps thinking enabled; Kimi K3 uses task-specific reasoning effort. Manual model IDs and endpoint overrides remain available.

## What “Update models” does

1. Fetch the public Paper Nexus catalogue anonymously. Reject untrusted endpoints, malformed IDs, rollback versions and same-version content changes.
2. For supported providers with a saved key, query the provider's own authenticated model-list endpoint. DeepSeek, OpenAI, Anthropic, Gemini, Kimi, Hunyuan and Qianfan use their documented list APIs; Anthropic pagination is followed.
3. Save a list only after all pages succeed. Keep the last list on failure. Exclude audio, image, embedding and other non-text models.
4. Report catalogue refresh and account-list refresh separately. Unsupported list APIs use the curated catalogue; they are not reported as live account queries.

[Gemini's compatible list API](https://ai.google.dev/gemini-api/docs/openai#list-models) is explicitly documented. [Qwen model discovery](https://help.aliyun.com/zh/model-studio/list-models) uses a different API and may require a workspace-specific endpoint. Qwen therefore uses the curated catalogue in this version; users of a workspace endpoint can enter its exact address. Saved keys are scoped to the exact provider and endpoint and are never moved to a new address by catalogue refresh.

Catalogue verification and successful model listing do not establish inference availability or account entitlement. The connection-test action exercises translation and topic requests separately. The automated tests use controlled responses for authentication, pagination, filtering, failure, cancellation and malformed output; paid generation has not been executed across all providers.

## Research-topic requests

Local semantic vectors and their nearest-neighbour relationships determine the groups. With the API option enabled, representative titles and abstracts from each group are submitted to produce a short scientific phrase. Author names and publication years do not enter that request. Group content, endpoint, model and prompt version identify cached names; unchanged groups are not resubmitted. Saving a key alone does not activate API topic analysis.
