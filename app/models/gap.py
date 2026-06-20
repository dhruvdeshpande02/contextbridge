import uuid

from sqlalchemy import Column, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class Gap(Base):
    __tablename__ = "gaps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False)
    description = Column(Text, nullable=False)
    risk_level = Column(String, nullable=False, default="medium")

    meeting = relationship("Meeting", back_populates="gaps")
