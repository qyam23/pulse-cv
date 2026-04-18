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

## Tech Stack
- Frontend: React (Vite) + Tailwind CSS + Framer Motion
- Backend: Express (Proxying Hugging Face API)
- AI Model: `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B`
