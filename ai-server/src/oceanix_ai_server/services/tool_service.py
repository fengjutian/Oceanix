"""Tool Service — central tool registry and execution.

Single source of truth for all tools (built-in + user-defined + MCP).
Handles registration, discovery, and invocation with optional
confirmation hooks for dangerous operations.
"""
from collections.abc import Callable
from loguru import logger

from ..models.tool import (
    ToolDefinition, ToolInvocation, ToolStatus,
    ToolCategory, ToolSource, ToolParameter,
)


class ToolService:
    """Central tool management — register, discover, invoke.

    Built-in tools are defined in code. User tools are loaded from
    JSON config files (~/.oceanix/tools.json, <project>/.oceanix/tools.json).
    MCP tools are registered dynamically by the MCP server layer.
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}
        self._handlers: dict[str, Callable[..., str]] = {}
        self._on_confirm: Callable[[ToolInvocation], bool] | None = None

    # ── registration ──────────────────────────────────

    def register(
        self,
        tool: ToolDefinition,
        handler: Callable[..., str] | None = None,
    ) -> None:
        """Register a tool definition and its handler."""
        self._tools[tool.id] = tool
        if handler:
            self._handlers[tool.id] = handler
        logger.debug(f"Tool registered: {tool.id} ({tool.source.value})")

    def register_builtin(
        self,
        id: str,
        display_name: str,
        description: str,
        handler: Callable[..., str],
        *,
        model_description: str | None = None,
        category: ToolCategory = ToolCategory.USER,
        parameters: list[ToolParameter] | None = None,
        requires_confirmation: bool = False,
        tags: list[str] | None = None,
    ) -> None:
        """Convenience method for registering a built-in tool."""
        self.register(ToolDefinition(
            id=id,
            display_name=display_name,
            description=description,
            model_description=model_description or description,
            category=category,
            source=ToolSource.BUILTIN,
            parameters=parameters or [],
            requires_confirmation=requires_confirmation,
            tags=tags or [],
            handler=handler,
        ), handler=handler)

    def unregister(self, tool_id: str) -> bool:
        """Remove a tool by id. Returns True if it existed."""
        existed = tool_id in self._tools
        self._tools.pop(tool_id, None)
        self._handlers.pop(tool_id, None)
        if existed:
            logger.debug(f"Tool unregistered: {tool_id}")
        return existed

    # ── discovery ─────────────────────────────────────

    def get(self, tool_id: str) -> ToolDefinition | None:
        return self._tools.get(tool_id)

    def list_all(self) -> list[ToolDefinition]:
        return list(self._tools.values())

    def list_by_category(self, category: ToolCategory) -> list[ToolDefinition]:
        return [t for t in self._tools.values() if t.category == category]

    def list_by_source(self, source: ToolSource) -> list[ToolDefinition]:
        return [t for t in self._tools.values() if t.source == source]

    def to_langchain_tools(self) -> list:
        """Return tools in LangChain format for Agent graph compatibility."""
        from langchain_core.tools import tool as langchain_tool

        wrapped = []
        for td in self._tools.values():
            if not td.enabled:
                continue
            handler = self._handlers.get(td.id)
            if handler is None:
                continue
            # Wrap as LangChain tool
            schema = td.to_json_schema()
            lc_tool = langchain_tool(handler)
            lc_tool.name = td.id
            lc_tool.description = schema.get("description", td.description)
            wrapped.append(lc_tool)
        return wrapped

    # ── invocation ────────────────────────────────────

    def invoke(self, tool_id: str, parameters: dict, invocation_id: str | None = None) -> ToolInvocation:
        """Execute a tool synchronously. Returns the invocation result."""
        import uuid
        inv = ToolInvocation(
            id=invocation_id or f"inv-{uuid.uuid4().hex[:8]}",
            tool_id=tool_id,
            parameters=parameters,
            status=ToolStatus.RUNNING,
        )

        tool = self._tools.get(tool_id)
        if tool is None:
            inv.status = ToolStatus.FAILED
            inv.error = f"Tool '{tool_id}' not found"
            return inv

        if not tool.enabled:
            inv.status = ToolStatus.FAILED
            inv.error = f"Tool '{tool_id}' is disabled"
            return inv

        # Confirmation check
        if tool.requires_confirmation:
            inv.status = ToolStatus.AWAITING_CONFIRMATION
            if self._on_confirm is None or not self._on_confirm(inv):
                inv.status = ToolStatus.FAILED
                inv.error = f"Tool '{tool_id}' requires confirmation which was denied"
                return inv

        inv.status = ToolStatus.RUNNING
        handler = self._handlers.get(tool_id)
        if handler is None:
            inv.status = ToolStatus.FAILED
            inv.error = f"No handler registered for tool '{tool_id}'"
            return inv

        try:
            result = handler(**parameters)
            inv.result = str(result)
            inv.status = ToolStatus.COMPLETED
        except Exception as e:
            inv.error = str(e)
            inv.status = ToolStatus.FAILED
            logger.warning(f"Tool '{tool_id}' failed: {e}")

        return inv

    def set_confirmation_handler(self, handler: Callable[[ToolInvocation], bool] | None) -> None:
        """Set a handler that will be called before executing confirmed-only tools.

        Return True to approve, False to deny.
        """
        self._on_confirm = handler
