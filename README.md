---
title: PulseCV AI
emoji: 📈
color: blue
sdk: docker
app_port: 7860
pinned: false
---

# PulseCV AI - Hugging Face Thinking Analysis

PulseCV AI is a premium resume analysis platform for checking how well a resume matches a specific job description. The public production runtime is designed for a Hugging Face Docker Space, with AI analysis performed server-side through Hugging Face Inference Providers.

## Deployment Instructions

### 1. Hugging Face Space
Create or open the Docker Space:

```text
qyam23/pulse-cv
```

Use this public URL after deployment:

```text
https://qyam23-pulse-cv.hf.space/
```

In **Space Settings > Variables and secrets**, add these server-side values:

```text
AI_PROVIDER=huggingface
HF_MODEL=Qwen/Qwen3-32B
HF_MODEL_CANDIDATES=Qwen/Qwen3-32B,deepseek-ai/DeepSeek-R1-Distill-Qwen-32B,Qwen/Qwen2.5-Coder-32B-Instruct
HF_TOKEN=<your Hugging Face token as a secret>
```

Notes:

- `HF_TOKEN` must be a secret, never frontend code.
- Hugging Face free/low-cost access depends on the current account quota and provider availability.
- GitHub Pages is static only. It can show a preview and link to the live Space, but it cannot securely run AI analysis by itself.

### 2. GitHub Setup
1. Push this code to your GitHub repository.
2. Keep GitHub Pages enabled only as a static preview/landing page.
3. Use Hugging Face Docker Space for the real analyzer runtime.

### 3. Local Run (Docker)
```bash
# Build the image
docker build -t pulsecv-ai .

# Run the container
docker run -p 7860:7860 -e PORT=7860 -e AI_PROVIDER=huggingface -e HF_TOKEN=your_key_here pulsecv-ai
```

### 4. Direct Node Run
```bash
npm install
npm run build
HF_TOKEN=your_key_here AI_PROVIDER=huggingface npm start
```

## Features
- **Hugging Face Thinking Models**: Primary model `Qwen/Qwen3-32B`, with DeepSeek/Qwen fallbacks.
- **Privacy First**: API keys are handled server-side and never exposed to the client.
- **RTL Support**: Full Hebrew support for resume analysis.
- **Neural Scanner**: Immersive visualization during the analysis phase.

## בדיקות לפני Commit

הרץ לפני כל commit:

```bat
run_tests.bat
```

**דרישות:**

- Node.js 18+
- [LM Studio](https://lmstudio.ai) לבדיקת AI מקומית אופציונלית

**מה הסקריפט בודק:**

1. TypeScript lint
2. Vite build ללא שגיאות
3. Bundle audit - אין API keys או provider SDK סודי בבאנדל הפרונט
4. Intelligence assets - כל JSON תקין ומכיל `_meta`
5. Server startup + endpoint health
6. SSRF protection - חסימת localhost
7. ניתוח AI דרך LM Studio אם השרת המקומי פעיל

**הערה:** בדיקת ה־AI היא non-blocking.
אם LM Studio לא פועל, הסקריפט מדלג עליה וממשיך. שאר הבדיקות הן הבדיקות החוסמות לצורך commit.

למידע נוסף ראה:

```text
SETUP_LOCAL_AI.md
```

## הפעלת האתר המקומי עם LM Studio

כדי לבדוק את חוויית המשתמש המלאה בדפדפן עם מודל מקומי:

```bat
run_site_lmstudio.bat
```

הקובץ:

- מגדיר `AI_PROVIDER=lmstudio`.
- משתמש ב־`http://localhost:1234/v1`.
- מזהה אוטומטית מודל טעון ב־LM Studio.
- מעדיף DeepSeek-R1, אחר כך Gemma 3, אחר כך כל מודל טעון אחר.
- פותח את האתר ב־`http://localhost:3000`.

אם LM Studio לא פעיל, האתר עדיין ייפתח, אבל ניתוח AI יציג הודעת local AI עד שתפעיל את LM Studio ותטען מודל.

## הפעלת האתר המקומי עם Hugging Face REST API

אם LM Studio לא מתחבר, אפשר להריץ את האתר מול Hugging Face Inference Providers:

```bat
run_site_huggingface.bat
```

השרת משתמש ב־REST endpoint:

```text
https://router.huggingface.co/v1/chat/completions
```

מודלים בסדר עדיפות:

```text
Qwen/Qwen3-32B
deepseek-ai/DeepSeek-R1-Distill-Qwen-32B
Qwen/Qwen2.5-Coder-32B-Instruct
```

צריך להגדיר token בצד השרת בלבד:

```text
HF_TOKEN=hf_your_token_here
```

או:

```text
HUGGING_FACE_API_KEY=hf_your_token_here
```

למידע נוסף ראה:

```text
SETUP_HUGGINGFACE_REST.md
```

## Tech Stack
- Frontend: React (Vite) + Tailwind CSS + Framer Motion
- Backend: Express (Proxying Hugging Face API)
- AI Model: `Qwen/Qwen3-32B`
