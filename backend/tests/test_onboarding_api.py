from fastapi.testclient import TestClient

from app.main import app
from tests.plan_factory import generated_plan


def test_example_selections_default_to_the_hosts_guest_total():
    with TestClient(app) as client:
        examples = client.get("/api/plan/examples").json()
        assert len(examples) == 4
        for example in examples:
            assert all(event["guest_count"] is None for day in example["days"] for event in day["events"])
            draft = generated_plan(1).model_dump(mode="json")
            draft["days"] = example["days"]
            response = client.post("/api/plan/build", json=draft)
            assert response.status_code == 200
            assert all(event["guest_count"] == draft["guest_count"]
                       for day in response.json()["days"] for event in day["events"])
