# News Category Classification - Backend (PySpark)

This backend provides training and serving for a news category classifier using PySpark ML and a small FastAPI app.

Structure
- `train.py` - PySpark training script that builds a Pipeline (tokenizer, stopwords, HashingTF, IDF, StringIndexer, LogisticRegression), evaluates, and saves the fitted pipeline.
- `app/main.py` - FastAPI app exposing `/predict` (single text) and `/predict_batch` (CSV upload) endpoints.
- `app/predictor.py` - helper to load the Spark model and run predictions.
- `sample_data/news_sample.csv` - small sample dataset (text,label,date) useful for quick local testing.
- `requirements.txt` - Python dependencies.
- `Dockerfile` - a simple Dockerfile for containerizing the API (optional).

Quick start (local):

1. Create a virtualenv and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Train a model locally using the sample dataset:

```bash
python train.py --input sample_data/news_sample.csv --model-out models/news_pipeline
```

3. Start the API (after training step above completes):

```bash
uvicorn app.main:app --reload --port 8000
```

4. Use `/predict` or `/predict_batch` to classify text or a CSV of news.

Notes
- The training script expects a CSV with columns `text` and `label`. `date` is optional.
- The API loads the saved pipeline model from `models/news_pipeline` by default. Adjust paths with env vars or by editing `app/predictor.py`.

Next steps: connect a frontend that uploads CSV, calls `/predict_batch`, and shows filters by date and category.