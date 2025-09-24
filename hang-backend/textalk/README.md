# Speech-to-Math Pipeline 🎤➡️📐

A complete pipeline that converts spoken mathematical expressions into LaTeX format using OpenAI Whisper for speech recognition and a trained NLP model for text-to-math conversion.

## 🎯 Pipeline Architecture

```
Audio Input → Whisper (Speech-to-Text) → NLP Model (Text-to-Math) → LaTeX Output
```

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd textalk

# Install dependencies
pip install -r requirements.txt
```

### 2. Train the Model

```bash
# Run complete training pipeline
python train_and_evaluate.py
```

This will:
- Generate a training dataset (5000 examples)
- Train a T5-based NLP model
- Evaluate the model performance
- Test the complete pipeline

### 3. Use the Pipeline

```bash
# Test with text input
python complete_pipeline.py

# Test with audio file
python -c "
from complete_pipeline import CompleteSpeechToMathPipeline
pipeline = CompleteSpeechToMathPipeline()
text, latex = pipeline.process_audio('your_audio.wav')
print(f'Text: {text}')
print(f'LaTeX: {latex}')
"
```

## 📁 Project Structure

```
textalk/
├── speech_to_math_pipeline.py    # Basic pipeline with rule-based conversion
├── complete_pipeline.py          # Complete pipeline with trained NLP model
├── dataset_generator.py          # Generate training dataset
├── nlp_model_trainer.py          # Train the NLP model
├── train_and_evaluate.py         # Complete training and evaluation script
├── requirements.txt              # Dependencies
└── README.md                     # This file
```

## 🧠 Model Architecture

### Speech Recognition (Whisper)
- **Model**: OpenAI Whisper (base model)
- **Input**: Audio files (WAV, MP3, etc.)
- **Output**: Transcribed text

### Text-to-Math Conversion (NLP Model)
- **Base Model**: T5-large (Text-to-Text Transfer Transformer)
- **Training Data**: 5000+ generated mathematical expressions
- **Input**: Natural language mathematical expressions
- **Output**: LaTeX mathematical expressions

## 📊 Training Data

The dataset includes:

### Integration Expressions
- "integral from 0 to infinity of e to the negative x dx" → `\int_{0}^{\infty} e^{-x} \, dx`
- "integrate x squared from 0 to 1" → `\int_{0}^{1} x^2 \, dx`

### Derivative Expressions
- "derivative of x squared with respect to x" → `\frac{d}{dx}(x^2)`
- "d sine x over d x" → `\frac{d}{dx}(\sin(x))`

### Limit Expressions
- "limit of sine x over x as x approaches zero" → `\lim_{x \to 0} \frac{\sin(x)}{x}`
- "lim 1 over x as x goes to infinity" → `\lim_{x \to \infty} \frac{1}{x}`

### Basic Operations
- "x squared plus y squared" → `x^2 + y^2`
- "square root of x plus y" → `\sqrt{x + y}`

## 🔧 Usage Examples

### Text-to-Math Conversion

```python
from complete_pipeline import CompleteSpeechToMathPipeline

# Initialize pipeline
pipeline = CompleteSpeechToMathPipeline()

# Convert text to math
text = "integral from 0 to infinity of e to the negative x dx"
latex = pipeline.process_text(text)
print(latex)  # \int_{0}^{\infty} e^{-x} \, dx
```

### Audio-to-Math Conversion

```python
# Process audio file
text, latex = pipeline.process_audio("math_expression.wav")
print(f"Transcribed: {text}")
print(f"LaTeX: {latex}")
```

### Batch Processing

```python
texts = [
    "derivative of x squared with respect to x",
    "limit of sine x over x as x approaches zero",
    "x squared plus y squared"
]

for text in texts:
    latex = pipeline.process_text(text)
    print(f"{text} → {latex}")
```

## 🎓 Training Your Own Model

### 1. Generate Custom Dataset

```python
from dataset_generator import MathDatasetGenerator

generator = MathDatasetGenerator()
dataset = generator.generate_dataset(num_samples=10000)
generator.save_dataset(dataset, "custom_dataset.json")
```

### 2. Train Custom Model

```python
from nlp_model_trainer import MathNLPTrainer

trainer = MathNLPTrainer(model_name="t5-base")  # Use larger model
trainer.prepare_data("custom_dataset.json")
trainer.train(
    output_dir="./custom_model",
    num_epochs=10,
    batch_size=16
)
```

### 3. Use Custom Model

```python
pipeline = CompleteSpeechToMathPipeline(
    nlp_model_path="./custom_model"
)
```

## 📈 Performance Metrics

The model is evaluated on:

- **Accuracy**: Exact match with expected LaTeX
- **BLEU Score**: Semantic similarity
- **Perplexity**: Model confidence
- **Inference Time**: Processing speed

## 🔍 Model Evaluation

After training, check:

- `evaluation_report.json` - Detailed metrics
- `training_progress.png` - Loss curves
- Test examples in the report

## 🛠️ Customization

### Adding New Mathematical Patterns

1. **Extend Dataset Generator**:
```python
# Add to math_patterns in dataset_generator.py
"new_pattern": [
    ("your text template", "\\latex_template"),
]
```

2. **Retrain Model**:
```bash
python train_and_evaluate.py
```

### Using Different Base Models

- **T5-small**: Fast, good for prototyping
- **T5-base**: Better accuracy, slower
- **T5-large**: Best accuracy, requires more resources (currently configured)

## 🚨 Troubleshooting

### Common Issues

1. **CUDA Out of Memory**:
   - Reduce batch size (already optimized for T5-large)
   - Use smaller model (t5-small or t5-base)
   - Use CPU: `device = "cpu"`
   - Enable gradient checkpointing

2. **Poor Transcription**:
   - Use higher quality audio
   - Try larger Whisper model
   - Preprocess audio (noise reduction)

3. **Incorrect Math Conversion**:
   - Add more training examples
   - Increase training epochs
   - Use larger NLP model

### Performance Tips

- **GPU**: Use CUDA for faster training
- **Batch Size**: Increase for better GPU utilization
- **Model Size**: Balance between accuracy and speed

## 📚 Dependencies

- **PyTorch**: Deep learning framework
- **Transformers**: Hugging Face model library
- **Whisper**: OpenAI speech recognition
- **Datasets**: Data processing
- **Scikit-learn**: Evaluation metrics

## 🔮 Future Enhancements

- [ ] Support for more mathematical domains
- [ ] Real-time audio processing
- [ ] Web interface
- [ ] Mobile app
- [ ] Integration with note-taking apps
- [ ] Multi-language support

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📞 Support

For questions or issues:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the evaluation report

---

**Built with ❤️ for the mathematical community**