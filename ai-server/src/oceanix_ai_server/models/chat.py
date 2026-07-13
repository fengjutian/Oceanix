"""Chat data models.

Defines the canonical message types used across all services.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class ChatRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


@dataclass
class ChatMessage:
    """Standard chat message used throughout the stack."""
    role: ChatRole
    content: str
    name: str | None = None          # tool name for tool messages
    tool_call_id: str | None = None  # id linking tool result to call


@dataclass
class ChatRequest:
    """Request to a chat/agent service."""
    messages: list[ChatMessage]
    model_id: str | None = None              # specific model to use
    context_files: list[str] = field(default_factory=list)
    system_prompt: str | None = None         # override system prompt


@dataclass
class ChatResponse:
    """Response from a chat/agent service."""
    content: str
    model_id: str
    finish_reason: Literal["stop", "length", "tool_calls", "error"] = "stop"
    tool_calls: list["ToolCall"] = field(default_factory=list)


@dataclass
class ToolCall:
    """A tool call requested by the LLM."""
    id: str
    name: str
    arguments: dict


@dataclass
class ToolResult:
    """Result of a tool execution."""
    call_id: str
    name: str
    output: str
    error: bool = False
