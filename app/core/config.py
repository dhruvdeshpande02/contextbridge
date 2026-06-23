from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    openai_api_key: str
    openai_extraction_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
