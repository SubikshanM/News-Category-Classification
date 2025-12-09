from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import pandas as pd
# Compatibility shim: older PySpark code expects DataFrame.iteritems; newer
# pandas removed it in favor of .items. Add a light alias so PySpark's
# pandas-conversion code works without depending on a specific pandas version.
if not hasattr(pd.DataFrame, 'iteritems'):
    pd.DataFrame.iteritems = pd.DataFrame.items
import io
import os
import csv
from typing import Optional

from .predictor import SparkPredictor
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# create app
app = FastAPI(title='News Category Classifier')

# serve static assets under /static and expose index at /
app.mount('/static', StaticFiles(directory='static'), name='static')
from fastapi.responses import FileResponse


@app.get('/', include_in_schema=False)
def root_index():
    # serve the single-page app index
    idx = os.path.join(os.path.dirname(__file__), '..', 'static', 'index.html')
    return FileResponse(idx)
# add CORS for common dev origin (adjust as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500", "http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-loaded predictor to avoid serialization issues with the reloader
predictor = None
MODEL_PATH = os.environ.get('MODEL_PATH', 'models/news_pipeline')


class TextRequest(BaseModel):
    text: str


def get_predictor():
    """Return a singleton SparkPredictor, creating it on first use.

    We avoid constructing the Spark session/model at import/startup time because
    the Uvicorn reload machinery may attempt to serialize module globals which
    aren't picklable (SparkSession / PipelineModel). Creating the predictor
    lazily inside request handling prevents that problem.
    """
    global predictor
    if predictor is None:
        try:
            predictor = SparkPredictor(model_path=MODEL_PATH)
        except Exception as e:
            # keep predictor as None and raise later from endpoints
            # Print full traceback to server logs to aid diagnosing Py4J / Spark errors
            import traceback
            tb = traceback.format_exc()
            print(f"Warning: failed to load model on demand: {e}\n{tb}")
            predictor = None
    return predictor


@app.post('/predict')
async def predict(req: TextRequest):
    p = get_predictor()
    if p is None:
        raise HTTPException(status_code=503, detail='Model not loaded')
    res = p.predict_single(req.text)
    return res


@app.post('/predict_batch')
async def predict_batch(file: UploadFile = File(...)):
    import traceback
    p = get_predictor()
    if p is None:
        raise HTTPException(status_code=503, detail='Model not loaded')
    # allow .csv and .tsv uploads (we auto-detect delimiter)
    if not file.filename.lower().endswith(('.csv', '.tsv')):
        raise HTTPException(status_code=400, detail='Only CSV/TSV files are supported')
    contents = await file.read()
    # parse uploaded bytes robustly: try several common separators/engines
    def parse_csv_content(b: bytes) -> pd.DataFrame:
        # decode bytes to text and try multiple read strategies
        text = b.decode('utf-8', errors='replace')
        errors = []
        # 1) default fast parser (comma)
        try:
            return pd.read_csv(io.StringIO(text))
        except Exception as e1:
            errors.append(str(e1))
        # 2) python engine auto-detect sep
        try:
            return pd.read_csv(io.StringIO(text), engine='python', sep=None)
        except Exception as e2:
            errors.append(str(e2))
        # 3) try tab-separated (TSV)
        try:
            return pd.read_csv(io.StringIO(text), sep='\t', engine='python')
        except Exception as e3:
            errors.append(str(e3))
        # 4) try semicolon-separated
        try:
            return pd.read_csv(io.StringIO(text), sep=';', engine='python')
        except Exception as e4:
            errors.append(str(e4))
        # 5) permissive: skip bad lines and treat quoting loosely
        try:
            return pd.read_csv(io.StringIO(text), engine='python', sep=None, on_bad_lines='skip', quoting=csv.QUOTE_NONE)
        except Exception as e5:
            errors.append(str(e5))
        # if all fail, raise a combined error
        raise Exception(' | '.join(errors))

    try:
        pdf = parse_csv_content(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'Failed to parse CSV (tried common separators/engines): {e}')

    # wrap the remainder in a broad try/except so we can return a helpful error during development
    try:
        # try to detect text column (common names or longest text column)
        lower_cols = [c.lower() for c in pdf.columns]
        preferred = ['text', 'content', 'article', 'body', 'headline', 'summary']
        text_col: Optional[str] = None
        for name in preferred:
            if name in lower_cols:
                text_col = pdf.columns[lower_cols.index(name)]
                break
        if text_col is None:
            # fallback: pick the column with dtype object and the largest average length
            obj_cols = [c for c in pdf.columns if pdf[c].dtype == object]
            if obj_cols:
                # compute approximate average length safely
                lengths = {}
                for c in obj_cols:
                    try:
                        lengths[c] = pdf[c].dropna().astype(str).map(len).mean()
                    except Exception:
                        lengths[c] = 0
                # pick the column with max average length
                text_col = max(lengths, key=lambda k: lengths[k])
        if text_col is None:
            raise HTTPException(status_code=400, detail=f"CSV does not contain any text-like columns. Detected columns: {list(pdf.columns)}")

        # convert to spark df
        spark = p.spark
        # detect a date-like column if present so we can offer date filtering
        lower_cols = [c.lower() for c in pdf.columns]
        date_candidates = ['date', 'published', 'timestamp', 'datetime', 'pub_date', 'published_at', 'created_at']
        date_col = None
        for name in date_candidates:
            if name in lower_cols:
                date_col = pdf.columns[lower_cols.index(name)]
                break

        # build clean PDF with mandatory text column and optional date column
        if date_col:
            clean_pdf = pdf[[text_col, date_col]].rename(columns={text_col: 'text', date_col: 'date'})
            # normalize date to string to avoid parsing/typing issues in Spark
            try:
                clean_pdf['date'] = clean_pdf['date'].astype(str)
            except Exception:
                clean_pdf['date'] = clean_pdf[date_col].apply(lambda v: '' if pd.isna(v) else str(v))
        else:
            clean_pdf = pdf[[text_col]].rename(columns={text_col: 'text'})
        # ensure text column is string
        clean_pdf['text'] = clean_pdf['text'].astype(str)
        # PySpark's pandas conversion may call `iteritems`, which was removed
        # in newer pandas versions. Convert to list-of-records to avoid that
        # compatibility issue.
        records = clean_pdf.to_dict(orient='records')
        # debug: print types to help diagnose pandas/pyspark conversion issues
        print('DEBUG: clean_pdf type:', type(clean_pdf), 'records type:', type(records))
        sdf = spark.createDataFrame(records)

        out_pdf = p.predict_batch(sdf)
        # return JSON list
        return out_pdf.to_dict(orient='records')
    except Exception as e:
        tb = traceback.format_exc()
        # print to server logs for debugging
        print('Error in /predict_batch:', e)
        print(tb)
        # return the error details in response for easier debugging in dev
        raise HTTPException(status_code=500, detail=f'Internal error during prediction: {e}\nSee server logs for traceback')
