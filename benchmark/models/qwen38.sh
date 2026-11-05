# Model profile: Qwen3.8-27B (hybrid Gated DeltaNet + full attention, native vision).
MODEL_REPO=Qwen/Qwen3.8-27B
MODEL_DIR=/dev/shm/qwen3.8-27b
SERVED_NAME=qwen3.8-27b
ALLOW_PATTERNS="['*.json', '*.txt', '*.jinja', '*.safetensors']"
INSTALL_PLUGIN=0
MODEL_ARGS=""
# Thinking mode off, so the 150-token budget goes to the scene report rather than to reasoning.
EXTRA_BODY='{"chat_template_kwargs": {"enable_thinking": false}}'
