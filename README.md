# News Category Classifier 📰

A modern web application for classifying news articles into categories using Apache Spark MLlib and machine learning.

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![Spark](https://img.shields.io/badge/Apache%20Spark-3.x-orange.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## ✨ Features

### 🤖 Machine Learning
- **TF-IDF based text classification** using Spark MLlib
- **Logistic Regression** model with 6-stage pipeline
- **Batch prediction** for CSV files
- **Single text prediction** for quick testing
- Support for multiple news categories (Business, Tech, Politics, Sport, Entertainment)

### 📊 Interactive Visualizations
- **Pie Chart** - Category distribution percentage view
- **Bar Chart** - Article count comparison across categories
- **Statistics Panel** - Real-time metrics with category breakdown
- **Responsive charts** powered by Chart.js

### 🎨 Modern UI/UX
- Beautiful gradient design with glassmorphic cards
- **Skeleton loading** states for better perceived performance
- **Animated transitions** and micro-interactions
- **Mobile-responsive** layout
- **Dark-themed charts** with professional styling
- Real-time search and filtering

### 🔧 Technical Features
- **FastAPI** backend with async support
- **Apache Spark** for distributed ML processing
- **CSV auto-detection** (comma, tab, semicolon separators)
- **Date column detection** and filtering
- **Drag-and-drop** file upload
- **Spark Web UI** integration for monitoring

## 🚀 Quick Start

### Prerequisites
- Python 3.10 or higher
- Apache Spark 3.x
- Java 8+ (required by Spark)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/SubikshanM/News-Category-Classification.git
cd News-Category-Classification
```

2. **Create virtual environment**
```bash
cd backend
python3 -m venv .venv310
source .venv310/bin/activate  # On Windows: .venv310\Scripts\activate
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

4. **Train the model** (if not already trained)
```bash
python train.py \
  --input sample_data/bbc-news-data.csv \
  --output models/news_pipeline
```

5. **Run the application**
```bash
uvicorn app.main:app --reload --port 8000
```

6. **Open your browser**
```
http://127.0.0.1:8000
```

## 📁 Project Structure

```
News-Category-Classification/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI endpoints
│   │   ├── predictor.py      # Spark ML predictor
│   │   └── __pycache__/
│   ├── models/
│   │   └── news_pipeline/    # Trained Spark ML model
│   ├── sample_data/
│   │   ├── bbc-news-data.csv
│   │   └── news_sample.csv
│   ├── static/
│   │   ├── index.html        # Frontend UI
│   │   ├── app.js            # JavaScript logic + charts
│   │   └── styles.css        # Modern styling
│   ├── tests/
│   │   └── test_smoke.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── train.py              # Model training script
├── .gitignore
└── README.md
```

## 🎯 Usage

### Single Text Prediction
1. Paste a news paragraph into the text area
2. Click **"Predict"**
3. View the predicted category and confidence score

### Batch CSV Upload
1. Prepare a CSV file with a text column (e.g., `text`, `content`, `article`)
2. Click **"Choose File"** or drag-and-drop
3. Click **"Upload & Predict"**
4. View results with interactive charts and filters

### CSV Format
Your CSV should have at least one text column:
```csv
text,date
"Breaking news about technology...",2024-01-15
"Sports update on the championship...",2024-01-16
```

Supported column names for auto-detection:
- **Text**: `text`, `content`, `article`, `body`, `headline`, `description`
- **Date**: `date`, `published`, `timestamp`, `pub_date`

## 📊 Visualizations

The application provides rich visualizations to analyze your classification results:

### Statistics Panel
- **Total Articles** count
- **Per-category breakdown** with counts and percentages
- Color-coded cards for easy identification

### Pie Chart
- Shows percentage distribution of categories
- Interactive legend with percentage labels
- Hover for detailed tooltips

### Bar Chart
- Compares article counts across categories
- Displays both count and percentage on hover
- Sorted by frequency for easy analysis

## 🛠️ API Endpoints

### POST `/predict`
Single text classification
```bash
curl -X POST http://127.0.0.1:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text": "Your news article text here"}'
```

**Response:**
```json
{
  "label": "business",
  "probability": 0.923
}
```

### POST `/predict_batch`
Batch CSV classification
```bash
curl -X POST http://127.0.0.1:8000/predict_batch \
  -F "file=@news.csv"
```

**Response:**
```json
{
  "count": 150,
  "results": [
    {
      "text": "News article...",
      "predicted_label": "tech",
      "confidence": 0.891,
      "date": "2024-01-15"
    }
  ]
}
```

### GET `/`
Serves the web interface

## 🔍 Model Details

### Pipeline Stages
1. **RegexTokenizer** - Splits text into words using `\W+` pattern
2. **StopWordsRemover** - Removes common English stop words
3. **HashingTF** - Converts words to feature vectors (262,144 features)
4. **IDF** - Applies TF-IDF weighting
5. **StringIndexer** - Encodes labels to indices
6. **LogisticRegression** - Classifies into categories (maxIter=20)

### Training Details
- **Split**: 80/20 train/test
- **Evaluation**: F1 score and accuracy on test set
- **Categories**: Automatically detected from training data
- **Model format**: Spark PipelineModel (portable across Spark clusters)

## 🐳 Docker Deployment

Build and run with Docker:
```bash
docker build -t news-classifier .
docker run -p 8000:8000 news-classifier
```

## 🧪 Testing

Run smoke tests:
```bash
python -m pytest tests/test_smoke.py -v
```

## 📈 Performance

- **Single prediction**: ~100-200ms
- **Batch prediction**: ~2-5s for 100 articles
- **Model size**: ~50MB
- **Memory**: 2-4GB recommended for Spark

## 🎨 UI Features

- **Skeleton loading cards** during uploads
- **Smooth animations** on all interactions
- **Category color coding** for easy identification
- **Search and filter** results in real-time
- **Preview modal** for full article text
- **Copy to clipboard** functionality
- **Responsive design** for mobile/tablet/desktop

## 🔧 Configuration

### Environment Variables
- `API_BASE`: Override API endpoint (default: same origin)

### Spark Configuration
Access Spark Web UI at: `http://127.0.0.1:4040` (after first prediction)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Subikshan M**
- GitHub: [@SubikshanM](https://github.com/SubikshanM)

## 🙏 Acknowledgments

- **Apache Spark** for distributed ML capabilities
- **FastAPI** for the modern Python web framework
- **Chart.js** for beautiful, responsive charts
- **BBC News Dataset** for training data

## 🚦 Roadmap

- [ ] Model improvements (n-grams, hyperparameter tuning)
- [ ] Confusion matrix analysis
- [ ] Export filtered results to CSV
- [ ] Confidence threshold slider
- [ ] Dark mode toggle
- [ ] User authentication
- [ ] API rate limiting
- [ ] Model versioning
- [ ] Real-time predictions via WebSocket
- [ ] Multi-language support

## 📞 Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/SubikshanM/News-Category-Classification/issues)
- Check existing documentation
- Review Spark logs for debugging

---

**Built with ❤️ using Apache Spark and Modern Web Technologies**
