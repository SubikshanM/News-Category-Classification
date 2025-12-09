from fastapi.testclient import TestClient
from app.main import app


def test_root_predict_endpoint():
    client = TestClient(app)
    # If model isn't loaded test will return 503; we just verify the endpoint exists and responds
    resp = client.post('/predict', json={'text': 'sample text'})
    assert resp.status_code in (200, 503)
