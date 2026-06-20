import uuid

from sqlalchemy import Column, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Decision(Base):
    __tablename__ = "decisions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False)
    text = Column(Text, nullable=False)
    owner = Column(String, nullable=True)
    confidence = Column(Float, nullable=False, default=0.0)

    meeting = relationship("Meeting", back_populates="decisions")
