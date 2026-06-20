import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base

EMBEDDING_DIM = 1536  # text-embedding-3-small output size


class MeetingChunk(Base):
    __tablename__ = "meeting_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIM), nullable=False)

    meeting = relationship("Meeting", back_populates="chunks")
