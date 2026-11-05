# Model profile: NVIDIA Cosmos3-Super, Reasoner tower only.
MODEL_REPO=nvidia/Cosmos3-Super
# vllm-torchtpu applies its Qwen3-VL TPU patches only when the model path contains "qwen3vl".
MODEL_DIR=/dev/shm/cosmos3-super-qwen3vl
SERVED_NAME=cosmos3-super-reasoner
# Reasoner and generator weights are interleaved in the shards; the plugin keeps only the Reasoner.
ALLOW_PATTERNS="['*.json', '*.txt', '*.jinja', 'transformer/*', 'vision_encoder/*', 'text_tokenizer/*']"
INSTALL_PLUGIN=1
MODEL_ARGS="--hf-overrides '{\"architectures\": [\"Cosmos3ReasonerForConditionalGeneration\"]}'"
EXTRA_BODY=''
