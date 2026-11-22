from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


def create_database_engine() -> Engine:
    """Create the product database engine from runtime configuration."""

    return create_engine(get_settings().database_url, pool_pre_ping=True)


engine = create_database_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection(engine: Engine | None = None) -> bool:
    """Return True when PostgreSQL accepts a simple connection check."""

    db_engine = engine or create_database_engine()
    with db_engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True
