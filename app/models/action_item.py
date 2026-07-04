import uuid

from sqlalchemy import Column, Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class ActionItem(Base):
    __tablename__ = "action_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id"), nullable=False)
    text = Column(Text, nullable=False)
    assignee = Column(String, nullable=True)
    depends_on = Column(String, nullable=True)
    due_date = Column(Date, nullable=True)

    meeting = relationship("Meeting", back_populates="action_items")
