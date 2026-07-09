from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from engine import __version__ as ENGINE_VERSION

app = FastAPI(title="tabIt API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "engineVersion": ENGINE_VERSION}
