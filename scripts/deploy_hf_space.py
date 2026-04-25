import os
from pathlib import Path

from huggingface_hub import HfApi, create_repo


SPACE_ID = os.getenv("HF_SPACE_ID", "qyam23/pulse-cv")
TOKEN = os.getenv("HF_TOKEN")
ROOT = Path(__file__).resolve().parents[1]


def require_token() -> str:
    if not TOKEN:
        raise SystemExit("HF_TOKEN is required to deploy the Hugging Face Space.")
    return TOKEN


def main() -> None:
    token = require_token()
    api = HfApi(token=token)

    create_repo(
        repo_id=SPACE_ID,
        repo_type="space",
        space_sdk="docker",
        exist_ok=True,
        token=token,
    )

    api.add_space_secret(repo_id=SPACE_ID, key="HF_TOKEN", value=token)
    api.add_space_variable(repo_id=SPACE_ID, key="AI_PROVIDER", value="huggingface")
    api.add_space_variable(repo_id=SPACE_ID, key="HF_MODEL", value=os.getenv("HF_MODEL", "Qwen/Qwen3-32B:nscale"))
    api.add_space_variable(
        repo_id=SPACE_ID,
        key="HF_MODEL_CANDIDATES",
        value=os.getenv(
            "HF_MODEL_CANDIDATES",
            "Qwen/Qwen3-32B:nscale,Qwen/Qwen3-32B:ovhcloud,Qwen/Qwen3-Coder-30B-A3B-Instruct:ovhcloud,Qwen/Qwen2.5-Coder-7B-Instruct:nscale,openai/gpt-oss-20b:groq,openai/gpt-oss-20b",
        ),
    )
    api.add_space_variable(repo_id=SPACE_ID, key="NODE_ENV", value="production")
    api.add_space_variable(repo_id=SPACE_ID, key="PORT", value="7860")

    api.upload_folder(
        repo_id=SPACE_ID,
        repo_type="space",
        folder_path=str(ROOT),
        path_in_repo=".",
        commit_message="Deploy PulseCV Docker Space",
        ignore_patterns=[
            ".git/*",
            ".github/*",
            ".sandbox/*",
            ".env",
            ".env.*",
            "node_modules/*",
            "artifacts/*",
            "*.log",
            "server-validation*.log",
            "hf_site*.log",
            "pulse_site.log",
        ],
    )

    print(f"Deployed {SPACE_ID} without exposing secrets.")


if __name__ == "__main__":
    main()
