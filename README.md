# PulseCV AI - DeepSeek Integration

PulseCV AI is a premium resume analysis platform using DeepSeek-R1 (Thinking Model) to provide deep hireability insights.

## Deployment Instructions

### 1. Preparation
Ensure you have a Hugging Face API Token. You can get one for free at [huggingface.co](https://huggingface.co/settings/tokens).

### 2. GitHub Setup
1. Push this code to your GitHub repository.
2. In your GitHub repository, go to **Settings > Secrets and variables > Actions**.
3. Add a new repository secret called `HUGGING_FACE_API_KEY` and paste your token.

### 3. Local Run (Docker)
```bash
# Build the image
docker build -t pulsecv-ai .

# Run the container
docker run -p 3000:3000 -e HUGGING_FACE_API_KEY=your_key_here pulsecv-ai
```

### 4. Direct Node Run
```bash
npm install
npm run build
HUGGING_FACE_API_KEY=your_key_here npm start
```

## Features
- **DeepSeek-R1 Integration**: Use the free Hugging Face Inference API.
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
- AI Model: `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B`
