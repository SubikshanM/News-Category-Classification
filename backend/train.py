import argparse
import os
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, when
from pyspark.ml import Pipeline
from pyspark.ml.feature import RegexTokenizer, StopWordsRemover, HashingTF, IDF, StringIndexer
from pyspark.ml.classification import LogisticRegression
from pyspark.ml.evaluation import MulticlassClassificationEvaluator


def build_and_train(input_path: str, model_out: str):
    spark = SparkSession.builder.master("local[*]").appName("news-trainer").getOrCreate()

    df = spark.read.csv(input_path, header=True)

    # Try to detect text and label columns
    cols = [c.lower() for c in df.columns]
    if 'text' in cols:
        text_col = [c for c in df.columns if c.lower() == 'text'][0]
    elif 'content' in cols:
        text_col = [c for c in df.columns if c.lower() == 'content'][0]
    else:
        raise ValueError("No text column found. Please provide a CSV with a 'text' or 'content' column")

    if 'label' in cols:
        label_col = [c for c in df.columns if c.lower() == 'label'][0]
    else:
        raise ValueError("No label column found. Please provide a CSV with a 'label' column for supervised training")

    df = df.select(col(text_col).alias('text'), col(label_col).alias('label'))
    df = df.na.drop(subset=['text', 'label'])

    # simple split
    train, test = df.randomSplit([0.8, 0.2], seed=42)

    tokenizer = RegexTokenizer(inputCol='text', outputCol='tokens', pattern='\\W+')
    remover = StopWordsRemover(inputCol='tokens', outputCol='filtered')
    hashing = HashingTF(inputCol='filtered', outputCol='rawFeatures', numFeatures=1 << 18)
    idf = IDF(inputCol='rawFeatures', outputCol='features')
    # allow unseen labels during transformation (e.g. if test split has a label
    # not seen in training). This avoids failing jobs with small/sample datasets.
    label_indexer = StringIndexer(inputCol='label', outputCol='labelIndex', handleInvalid='keep')
    lr = LogisticRegression(featuresCol='features', labelCol='labelIndex', maxIter=20)

    pipeline = Pipeline(stages=[tokenizer, remover, hashing, idf, label_indexer, lr])

    model = pipeline.fit(train)

    preds = model.transform(test)

    evaluator = MulticlassClassificationEvaluator(labelCol='labelIndex', predictionCol='prediction', metricName='f1')
    f1 = evaluator.evaluate(preds)
    acc_eval = MulticlassClassificationEvaluator(labelCol='labelIndex', predictionCol='prediction', metricName='accuracy')
    acc = acc_eval.evaluate(preds)

    print(f"Evaluation - F1: {f1:.4f}, Accuracy: {acc:.4f}")

    os.makedirs(model_out, exist_ok=True)
    model.write().overwrite().save(model_out)
    print(f"Saved model to {model_out}")

    spark.stop()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True, help='Input CSV file with text and label columns')
    parser.add_argument('--model-out', default='models/news_pipeline', help='Output path to save trained pipeline')
    args = parser.parse_args()
    build_and_train(args.input, args.model_out)
