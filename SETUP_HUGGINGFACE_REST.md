# Hugging Face REST API Setup

PulseCV can use Hugging Face Inference Providers through the OpenAI-compatible REST API.

## REST endpoint

```text
POST https://router.huggingface.co/v1/chat/completions
```

Headers:

```text
Authorization: Bearer hf_your_token_here
Content-Type: application/json
```

Example request body:

```json
{
  "model": "Qwen/Qwen3-32B",
  "messages": [
    {
      "role": "system",
      "content": "You are a precise ATS resume analyzer. Return only valid JSON."
    },
    {
      "role": "user",
      "content": "Analyze this resume against this job description..."
    }
  ],
  "temperature": 0.2,
  "max_tokens": 1600,
  "stream": false,
  "response_format": {
    "type": "json_object"
  }
}
```

## Recommended models for this project

The local runner uses this fallback order:

```text
Qwen/Qwen3-32B
deepseek-ai/DeepSeek-R1-Distill-Qwen-32B
Qwen/Qwen2.5-Coder-32B-Instruct
```

Notes:

- `Qwen/Qwen3-32B` supports multilingual text and thinking/non-thinking behavior.
- `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B` is a reasoning-oriented 32B model.
- `Qwen/Qwen2.5-Coder-32B-Instruct` is included as a practical 32B fallback when router/provider availability differs.

## Environment variables

Use one of:

```text
HF_TOKEN=hf_your_token_here
HUGGING_FACE_API_KEY=hf_your_token_here
```

Optional:

```text
AI_PROVIDER=huggingface
HF_MODEL=Qwen/Qwen3-32B
HF_MODEL_CANDIDATES=Qwen/Qwen3-32B,deepseek-ai/DeepSeek-R1-Distill-Qwen-32B
```

## Run locally

```bat
run_site_huggingface.bat
```

The browser opens:

```text
http://localhost:3000
```

## Security

- Hugging Face tokens are read server-side only.
- No token is stored in frontend code.
- No token is sent to the browser.
- The frontend calls only local `/api/analyze`.

## Troubleshooting

**401 / HF_TOKEN_MISSING**

Add `HF_TOKEN` or `HUGGING_FACE_API_KEY` to `.env` or Windows environment.

**503 / model unavailable**

The router or selected model/provider may be unavailable. Set:

```text
HF_MODEL=deepseek-ai/DeepSeek-R1-Distill-Qwen-32B
```

or use the fallback list:

```text
HF_MODEL_CANDIDATES=Qwen/Qwen3-32B,deepseek-ai/DeepSeek-R1-Distill-Qwen-32B,Qwen/Qwen2.5-Coder-32B-Instruct
```
