"""
Configuration file for the Speech-to-Math Pipeline
Easy switching between different model configurations.
"""

import torch

# Model configurations
MODEL_CONFIGS = {
    "t5-small": {
        "model_name": "t5-small",
        "batch_size": 8,
        "eval_batch_size": 8,
        "fp16": False,
        "description": "Fast, good for prototyping"
    },
    "t5-base": {
        "model_name": "t5-base", 
        "batch_size": 4,
        "eval_batch_size": 4,
        "fp16": True,
        "description": "Balanced performance and speed"
    },
    "t5-large": {
        "model_name": "t5-large",
        "batch_size": 2,
        "eval_batch_size": 2,
        "fp16": True,
        "description": "Best accuracy, requires more resources"
    }
}

# Current configuration
CURRENT_MODEL = "t5-large"

# Training parameters
TRAINING_CONFIG = {
    "num_epochs": 6,
    "learning_rate": 5e-5,
    "warmup_steps": 100,
    "weight_decay": 0.01,
    "logging_steps": 50,
    "save_steps": 500,
    "eval_steps": 200,
    "max_length": 128,
    "dataset_size": 100
}

# Whisper configuration
WHISPER_CONFIG = {
    "model_size": "base",  # tiny, base, small, medium, large
    "language": "en",
    "task": "transcribe"
}

# Output directories
OUTPUT_DIRS = {
    "model_output": "./mathbridge-results",
    "logs": "./logs",
    "dataset": "./math_dataset.json",
    "evaluation": "./evaluation_report.json"
}

def get_model_config(model_name=None):
    """Get configuration for specified model or current model."""
    if model_name is None:
        model_name = CURRENT_MODEL
    
    if model_name not in MODEL_CONFIGS:
        raise ValueError(f"Unknown model: {model_name}. Available: {list(MODEL_CONFIGS.keys())}")
    
    return MODEL_CONFIGS[model_name]

def get_training_args(model_name=None, enable_evaluation=True):
    """Get training arguments for specified model."""
    model_config = get_model_config(model_name)
    
    # Check if CUDA is available for FP16
    cuda_available = torch.cuda.is_available()
    fp16_enabled = model_config["fp16"] and cuda_available
    
    # Adjust batch size for CPU training
    batch_size = model_config["batch_size"]
    eval_batch_size = model_config["eval_batch_size"]
    
    if not cuda_available:
        if model_config["fp16"]:
            print("⚠️  FP16 disabled: CUDA not available, using CPU")
        # Increase batch size for CPU training (CPU can handle larger batches)
        batch_size = min(batch_size * 2, 8)  # Cap at 8 for memory reasons
        eval_batch_size = min(eval_batch_size * 2, 8)
        print(f"⚠️  Batch size increased for CPU: {batch_size} (train), {eval_batch_size} (eval)")
    
    base_args = {
        "output_dir": OUTPUT_DIRS["model_output"],
        "num_train_epochs": TRAINING_CONFIG["num_epochs"],
        "per_device_train_batch_size": batch_size,
        "per_device_eval_batch_size": eval_batch_size,
        "warmup_steps": TRAINING_CONFIG["warmup_steps"],
        "weight_decay": TRAINING_CONFIG["weight_decay"],
        "logging_dir": OUTPUT_DIRS["logs"],
        "logging_steps": TRAINING_CONFIG["logging_steps"],
        "save_steps": TRAINING_CONFIG["save_steps"],
        "save_total_limit": 2,
        "fp16": fp16_enabled,
        "report_to": None
    }
    
    if enable_evaluation:
        base_args.update({
            "evaluation_strategy": "steps",
            "eval_steps": TRAINING_CONFIG["eval_steps"],
            "load_best_model_at_end": True,
            "metric_for_best_model": "eval_loss",
            "greater_is_better": False
        })
    else:
        base_args.update({
            "evaluation_strategy": "no",
            "load_best_model_at_end": False
        })
    
    return base_args

def print_config_summary():
    """Print current configuration summary."""
    print("🔧 Current Configuration")
    print("=" * 40)
    
    model_config = get_model_config()
    cuda_available = torch.cuda.is_available()
    device = "CUDA" if cuda_available else "CPU"
    
    print(f"Device: {device}")
    if cuda_available:
        print(f"GPU: {torch.cuda.get_device_name()}")
        print(f"GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    
    print(f"Model: {model_config['model_name']}")
    print(f"Description: {model_config['description']}")
    print(f"Batch Size: {model_config['batch_size']}")
    print(f"FP16: {model_config['fp16'] and cuda_available}")
    print(f"Epochs: {TRAINING_CONFIG['num_epochs']}")
    print(f"Dataset Size: {TRAINING_CONFIG['dataset_size']}")
    print(f"Whisper Model: {WHISPER_CONFIG['model_size']}")
    
    if not cuda_available:
        print("\n⚠️  Warning: CUDA not available - training will be slower on CPU")
        print("   Consider using a smaller model (t5-small or t5-base)")
    
    print("\nAvailable Models:")
    for name, config in MODEL_CONFIGS.items():
        marker = " (current)" if name == CURRENT_MODEL else ""
        print(f"  - {name}: {config['description']}{marker}")

if __name__ == "__main__":
    print_config_summary()
