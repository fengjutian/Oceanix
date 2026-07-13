"""Tool data models.

Defines ToolDefinition, ToolInvocation, and associated types
for the tool infrastructure layer.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Literal


class ToolStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    AWAITING_CONFIRMATION = "awaiting_confirmation"


class ToolCategory(str, Enum):
    FILE = "file"
    SEARCH = "search"
    GIT = "git"
    TERMINAL = "terminal"
    USER = "user"


class ToolSource(str, Enum):
    BUILTIN = "builtin"
    USER_GLOBAL = "user:global"
    USER_PROJECT = "user:project"
    MCP = "mcp"


@dataclass
class ToolParameter:
    """A single parameter definition for a tool."""
    name: str
    type: str               # "str", "int", "float", "bool", "dict", "list[str]"
    description: str = ""
    required: bool = True


@dataclass
class ToolDefinition:
    """Complete tool definition — what the LLM sees and what the executor needs."""
    id: str
    display_name: str
    description: str                          # user-facing description
    model_description: str | None = None      # LLM-facing description (longer, more detailed)
    category: ToolCategory = ToolCategory.USER
    source: ToolSource = ToolSource.BUILTIN
    parameters: list[ToolParameter] = field(default_factory=list)
    requires_confirmation: bool = False
    enabled: bool = True
    tags: list[str] = field(default_factory=list)
    # Runtime handler — set at registration time
    handler: Callable[..., str] | None = field(default=None, repr=False)

    def to_json_schema(self) -> dict:
        """Convert parameters to JSON Schema format for LLM consumption."""
        props: dict[str, dict] = {}
        required: list[str] = []
        type_map = {"str": "string", "int": "integer", "float": "number", "bool": "boolean"}
        for p in self.parameters:
            props[p.name] = {
                "type": type_map.get(p.type, "string"),
                "description": p.description,
            }
            if p.required:
                required.append(p.name)
        return {
            "name": self.id,
            "description": self.model_description or self.description,
            "parameters": {
                "type": "object",
                "properties": props,
                "required": required,
            } if props else {"type": "object", "properties": {}},
        }


@dataclass
class ToolInvocation:
    """A single invocation of a tool — tracks state from request to result."""
    id: str
    tool_id: str
    parameters: dict[str, Any]
    status: ToolStatus = ToolStatus.PENDING
    result: str | None = None
    error: str | None = None

    def to_result(self) -> str:
        if self.status == ToolStatus.COMPLETED:
            return self.result or "(no output)"
        if self.status == ToolStatus.FAILED:
            return f"Error: {self.error or 'Unknown error'}"
        return f"Tool {self.tool_id} is {self.status.value}"
