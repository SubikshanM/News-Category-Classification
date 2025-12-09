from typing import List, Dict
from pyspark.sql import SparkSession
from pyspark.sql.functions import col


class SparkPredictor:
    def __init__(self, model_path: str = 'models/news_pipeline'):
        self.spark = SparkSession.builder.master('local[*]').appName('news-predictor').getOrCreate()
        # load pipeline model
        from pyspark.ml import PipelineModel
        self.model = PipelineModel.load(model_path)

        # discover label indexer to get labels mapping
        self.labels = None
        for s in self.model.stages:
            # StringIndexerModel class name
            if s.__class__.__name__ == 'StringIndexerModel':
                self.labels = s.labels
                break

        if self.labels is None:
            # fallback: try to read label metadata from model
            self.labels = []

    def predict_single(self, text: str) -> Dict:
        df = self.spark.createDataFrame([(text,)], ['text'])
        out = self.model.transform(df)
        row = out.select('prediction', 'probability').head()
        pred_idx = int(row['prediction'])
        prob = row['probability']
        top_prob = float(max(prob)) if prob is not None else None
        label = self.labels[pred_idx] if self.labels and pred_idx < len(self.labels) else str(pred_idx)
        return {'label': label, 'probability': top_prob}

    def predict_batch(self, df):
        """
        Accepts a pyspark DataFrame with a 'text' column and returns a pandas DataFrame with predictions.
        """
        out = self.model.transform(df)
        # map prediction index to label using self.labels
        def idx_to_label(idx):
            try:
                return self.labels[int(idx)]
            except Exception:
                return str(idx)

        # include 'date' column in output if present in the incoming DataFrame
        cols_to_select = ['text', 'prediction', 'probability']
        if 'date' in df.columns:
            cols_to_select.insert(1, 'date')

        pdf = out.select(*cols_to_select).toPandas()
        pdf['predicted_label'] = pdf['prediction'].apply(idx_to_label)
        # extract top probability
        pdf['confidence'] = pdf['probability'].apply(lambda v: float(max(v)) if v is not None else None)
        # preserve date column if present
        if 'date' in pdf.columns:
            return pdf[['text', 'date', 'predicted_label', 'confidence']]
        return pdf[['text', 'predicted_label', 'confidence']]
