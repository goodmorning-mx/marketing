from fastapi import FastAPI

app = FastAPI(title="GoodMorning Marketing API", version="0.0.0-reset")


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "GoodMorning Marketing API", "status": "ok", "environment": "reset"}
