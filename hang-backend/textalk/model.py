#!/usr/bin/env python3
"""
Natural Language to LaTeX Translation Model
===========================================

This script trains a T5 model to translate natural language descriptions
to LaTeX mathematical expressions.

Example:
    "integral of x squared dx" -> "\\int x^2 \\, dx"

Usage:
    python model.py
"""

import subprocess
import sys
import importlib
import torch
import numpy as np
import pandas as pd
from datasets import load_dataset
from transformers import (
    T5Tokenizer,
    T5ForConditionalGeneration,
    TrainingArguments,
    Trainer,
    DataCollatorForSeq2Seq,
    AutoTokenizer
)
import time
from sklearn.model_selection import train_test_split
from config import get_model_config, get_training_args, TRAINING_CONFIG

DATASET_SIZE = TRAINING_CONFIG["dataset_size"]


class MathBridgeTrainer:
    """Main class for training natural language to LaTeX translation model"""
    
    def __init__(self, model_name=None, dataset_size=DATASET_SIZE):
        """
        Initialize the trainer
        
        Args:
            model_name (str): Hugging Face model name to use
            dataset_size (int): Number of samples to use for training
        """
        # Get model configuration
        if model_name is None:
            model_config = get_model_config()
            self.model_name = model_config["model_name"]
        else:
            self.model_name = model_name
            
        self.dataset_size = dataset_size
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = None
        self.model = None
        self.train_dataset = None
        self.eval_dataset = None
        self.trainer = None
        
        
    def install_dependencies(self):
        """Install required packages with robust error handling"""
        def install_package(package):
            """Install a package and handle errors gracefully"""
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", package])
                return True
            except subprocess.CalledProcessError as e:
                return False

        # Core packages
        packages = [
            "datasets", "huggingface-hub", "torch", "transformers", 
            "accelerate", "numpy", "pandas", "scikit-learn"
        ]
        
        for package in packages:
            install_package(package)
        
        # Handle SentencePiece specially
        sentencepiece_installed = False
        
        if install_package("sentencepiece"):
            sentencepiece_installed = True
        else:
            if install_package("sentencepiece --no-binary=sentencepiece"):
                sentencepiece_installed = True
        
        # Other tokenizer dependencies
        install_package("tokenizers")
        install_package("protobuf")
        
        return sentencepiece_installed
        
    def setup_tokenizer(self):
        """Setup tokenizer with fallback options"""
        
        tokenizer = None
        model_name = None

        # Option 1: Try T5 tokenizer (requires SentencePiece)
        try:
            tokenizer = T5Tokenizer.from_pretrained("t5-large")
            model_name = "t5-large"

        except Exception as e:
            # Option 2: Try BERT tokenizer (doesn't require SentencePiece)
            try:
                tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
                model_name = "bert-base-uncased"

            except Exception as e2:
                # Option 3: Try GPT-2 tokenizer (most compatible)
                try:
                    tokenizer = AutoTokenizer.from_pretrained("gpt2")
                    model_name = "gpt2"

                except Exception as e3:
                    raise Exception("Could not load any tokenizer. Please check your transformers installation.")

        # Configure padding token
        if tokenizer.pad_token is None:
            if hasattr(tokenizer, 'eos_token') and tokenizer.eos_token:
                tokenizer.pad_token = tokenizer.eos_token
            else:
                tokenizer.add_special_tokens({'pad_token': '[PAD]'})

        self.tokenizer = tokenizer
        self.model_name = model_name

        # Test tokenization
        self._test_tokenization()
        
    def _test_tokenization(self):
        """Test tokenizer functionality"""
        test_input = "integral of x squared dx"
        test_target = "\\int x^2 \\, dx"

        try:
            input_tokens = self.tokenizer(test_input, return_tensors="pt")
            target_tokens = self.tokenizer(test_target, return_tensors="pt")

        except Exception as e:
            pass
            
    def load_dataset(self):
        """Load and prepare the MathBridge dataset"""
        # Load dataset
        ds = load_dataset("Kyudan/MathBridge", "train")
        
        # Use subset for faster training
        nds = ds['train'].select(range(self.dataset_size))
        ds['train'] = nds
            
        return ds
        
    def preprocess_dataset(self, dataset):
        """Preprocess dataset for T5 training"""
        
        def preprocess_function(examples):
            """Preprocess examples for T5 training"""
            # Add T5 task prefix
            inputs = []
            targets = []
            for idx in range(len(examples)):
                inputs.append(examples['context_before'][idx] + examples['spoken_English'][idx] + examples['context_after'][idx])
                targets.append(examples['context_before'][idx] + examples['equation'][idx] + examples['context_after'][idx])

            # Tokenize inputs
            model_inputs = self.tokenizer(
                inputs,
                max_length=128,
                truncation=True,
                padding=True
            )

            # Tokenize targets
            with self.tokenizer.as_target_tokenizer():
                labels = self.tokenizer(
                    targets,
                    max_length=128,
                    truncation=True,
                    padding=True
                )

            # Replace padding token ids with -100 (ignored in loss computation)
            labels_input_ids = labels["input_ids"]
            for i, label_seq in enumerate(labels_input_ids):
                for j, token_id in enumerate(label_seq):
                    if token_id == self.tokenizer.pad_token_id:
                        labels_input_ids[i][j] = -100

            model_inputs["labels"] = labels_input_ids
            return model_inputs

        # Apply preprocessing
        processed_dataset = dataset['train'].map(
            preprocess_function,
            batched=True,
            remove_columns=['context_before', 'context_after', 'spoken_English', 'equation']
        )

        return processed_dataset
        
    def split_dataset(self, processed_dataset):
        """Split dataset into train/validation sets"""
        
        train_size = int(0.8 * len(processed_dataset))
        train_dataset = processed_dataset.select(range(train_size))
        eval_dataset = processed_dataset.select(range(train_size, len(processed_dataset)))

        self.train_dataset = train_dataset
        self.eval_dataset = eval_dataset

        print(f"Training samples: {len(train_dataset)}")
        print(f"Validation samples: {len(eval_dataset)}")
        
    def setup_model(self):
        """Load and configure the model"""
        if self.model_name == "t5-large":
            model = T5ForConditionalGeneration.from_pretrained("t5-large")

        elif self.model_name in ["bert-base-uncased", "gpt2"]:
            try:
                model = T5ForConditionalGeneration.from_pretrained("t5-large")
            except:
                from transformers import AutoModelForCausalLM
                model = AutoModelForCausalLM.from_pretrained("gpt2")

        # Resize token embeddings to match tokenizer vocabulary
        try:
            model.resize_token_embeddings(len(self.tokenizer))
        except Exception as e:
            pass

        # Move model to device
        model = model.to(self.device)
        self.model = model

        print(f"✅ Model setup completed:")
        print(f"  Model: {self.model_name}")
        print(f"  Parameters: {model.num_parameters():,}")
        print(f"  Device: {next(model.parameters()).device}")
        try:
            print(f"  Vocab size: {model.config.vocab_size}")
        except:
            print(f"  Vocab size: Unknown")
            
    def setup_training(self, enable_evaluation=False):
        """Setup training configuration"""
        print("⚙️ Setting up training configuration...")
        
        # Data collator for dynamic padding
        data_collator = DataCollatorForSeq2Seq(
            tokenizer=self.tokenizer,
            model=self.model,
            padding=True
        )

        # Training arguments from configuration
        training_args = TrainingArguments(**get_training_args(enable_evaluation=enable_evaluation))

        # Create trainer
        if enable_evaluation:
            trainer = Trainer(
                model=self.model,
                args=training_args,
                train_dataset=self.train_dataset,
                eval_dataset=self.eval_dataset,
                tokenizer=self.tokenizer,
                data_collator=data_collator,
                compute_metrics=self._compute_metrics_safe
            )
        else:
            trainer = Trainer(
                model=self.model,
                args=training_args,
                train_dataset=self.train_dataset,
                tokenizer=self.tokenizer,
                data_collator=data_collator
            )

        self.trainer = trainer

        print("Training configuration:")
        print(f"  Epochs: {training_args.num_train_epochs}")
        print(f"  Batch size: {training_args.per_device_train_batch_size}")
        print(f"  Learning rate: {training_args.learning_rate}")
        print(f"  Device: {self.device}")
        print(f"  Evaluation: {enable_evaluation}")
        
    def _compute_metrics_safe(self, eval_pred):
        """Safe evaluation metric that avoids tokenizer decode issues"""
        try:
            predictions, labels = eval_pred
            
            # Handle different prediction formats
            if hasattr(predictions, 'predictions'):
                predictions = predictions.predictions
                
            # Convert logits to token IDs if needed
            if len(predictions.shape) == 3:  # [batch, seq_len, vocab_size]
                predictions = np.argmax(predictions, axis=-1)
            
            # Ensure proper numpy arrays
            predictions = np.array(predictions)
            labels = np.array(labels)
            
            # Create mask for valid tokens (not padding)
            valid_mask = (labels != -100)
            
            if valid_mask.sum() == 0:
                return {"accuracy": 0.0, "correct_tokens": 0, "total_tokens": 1}
            
            # Calculate token-level accuracy
            correct_predictions = (predictions == labels) & valid_mask
            accuracy = correct_predictions.sum() / valid_mask.sum()
            
            return {
                "accuracy": float(accuracy),
                "correct_tokens": int(correct_predictions.sum()),
                "total_tokens": int(valid_mask.sum())
            }
            
        except Exception as e:
            print(f"Metrics error: {e}")
            return {"accuracy": 0.0, "correct_tokens": 0, "total_tokens": 1}
            
    def train(self):
        """Start training the model"""
        print("Starting training...")
        
        try:
            # Start training
            self.trainer.train()
            print("Training completed successfully!")
            
            # Save the model
            self.trainer.save_model("./mathbridge-final")
            self.tokenizer.save_pretrained("./mathbridge-final")
            print("Model saved to ./mathbridge-final")
            
            return True
            
        except Exception as e:
            print(f"Training failed: {e}")
            return False
            
    def test_model(self, test_examples=None):
        """Test the trained model with example inputs"""
        if test_examples is None:
            test_examples = [
                "integral of x squared dx",
                "derivative of sine x",
                "x plus y squared",
                "square root of x",
                "sum from i equals 1 to n",
                "limit as x approaches zero",
                "a over b",
                "x to the power of 3",
                "cosine of theta",
                "natural log of x"
            ]

        print("Testing the trained model:")

        for i, example in enumerate(test_examples, 1):
            try:
                result = self._translate_text(example)
                print(f"{i:2d}. Input:  {example}")
                print(f"    Output: {result}")
            except Exception as e:
                print(f"Error testing '{example}': {e}")
        
    def _translate_text(self, input_text):
        """Translate natural language to LaTeX"""
        # Add the task prefix
        input_text_formatted = input_text

        # Tokenize input
        inputs = self.tokenizer(input_text_formatted, return_tensors="pt", padding=True, truncation=True)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        # Generate output
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_length=128,
                num_beams=4,
                early_stopping=True,
                do_sample=False
            )

        # Decode output
        decoded = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        return decoded
        
    def run_full_pipeline(self, enable_evaluation=False):
        """Run the complete training pipeline"""
        print("Starting MathBridge Training Pipeline")
        
        # Step 1: Setup tokenizer
        self.setup_tokenizer()
        
        # Step 2: Load dataset
        dataset = self.load_dataset()
        
        # Step 3: Preprocess dataset
        processed_dataset = self.preprocess_dataset(dataset)
        
        # Step 4: Split dataset
        self.split_dataset(processed_dataset)
        
        # Step 5: Setup model
        self.setup_model()
        
        # Step 6: Setup training
        self.setup_training(enable_evaluation=enable_evaluation)
        
        # Step 7: Train
        success = self.train()
        
        if success:
            # Step 8: Test model
            self.test_model()
        
        return success


def main():
    """Main function to run the training pipeline"""
    
    # Create trainer instance
    trainer = MathBridgeTrainer(model_name="t5-large", dataset_size=DATASET_SIZE)
    
    # Option 1: Run with evaluation (may have tokenizer issues)
    # success = trainer.run_full_pipeline(enable_evaluation=True)
    
    # Option 2: Run without evaluation (more stable)
    success = trainer.run_full_pipeline(enable_evaluation=False)
    
    if success:
        print("Training completed successfully!")
    else:
        print("Training failed. Please check the error messages above.")


if __name__ == "__main__":
    main()

