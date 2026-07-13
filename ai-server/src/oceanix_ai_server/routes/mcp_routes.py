"""MCP Routes — extends FastMCP with resources and prompts.

Adds MCP resources (project files, git diffs, etc.)
and prompt templates to the existing FastMCP stdio server.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path
from loguru import logger


# ── Resource types ─────────────────────────────────────

@dataclass
class MCPResource:
    """An MCP resource that agents can read."""
    uri: str               # e.g. "file:///src/main.rs"
    name: str              # Human-readable label
    description: str = ""
    mime_type: str = "text/plain"

    def read(self) -> str:
        """Read the resource content."""
        raise NotImplementedError


@dataclass
class FileResource(MCPResource):
    """A project file exposed as an MCP resource."""

    def read(self) -> str:
        try:
            path = self.uri.replace("file://", "")
            if not os.path.isabs(path):
                return f"Error: path must be absolute: {path}"
            return Path(path).read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            return f"Error reading {self.uri}: {e}"


@dataclass
class GitDiffResource(MCPResource):
    """A git diff exposed as an MCP resource."""
    repo_path: str = ""

    def read(self) -> str:
        try:
            import subprocess
            result = subprocess.run(
                ["git", "-C", self.repo_path or os.getcwd(), "diff", "--stat"],
                capture_output=True, text=True, timeout=10,
            )
            return result.stdout or "(clean working tree)"
        except Exception as e:
            return f"Error reading git diff: {e}"


# ── Prompt types ───────────────────────────────────────

@dataclass
class MCPPrompt:
    """An MCP prompt template that users/agents can invoke."""
    name: str
    description: str
    template: str
    arguments: list[dict] = field(default_factory=list)


# ── MCP Routes manager ────────────────────────────────

class MCPRoutes:
    """Manages MCP resources and prompts.

    Integrates with the existing FastMCP server by providing
    resource listing, reading, and prompt discovery.
    """

    def __init__(self) -> None:
        self.resources: dict[str, MCPResource] = {}
        self.prompts: dict[str, MCPPrompt] = {}

    # ── Resource management ────────────────────────────

    def register_resource(self, resource: MCPResource) -> None:
        self.resources[resource.uri] = resource
        logger.debug(f"MCP resource registered: {resource.uri}")

    def list_resources(self) -> list[dict]:
        """Return resource metadata (MCP resources/list)."""
        return [
            {
                "uri": r.uri,
                "name": r.name,
                "description": r.description,
                "mimeType": r.mime_type,
            }
            for r in self.resources.values()
        ]

    def read_resource(self, uri: str) -> str:
        """Read a resource (MCP resources/read)."""
        resource = self.resources.get(uri)
        if resource is None:
            return f"Resource not found: {uri}"
        return resource.read()

    def discover_project_files(self, root: str) -> list[dict]:
        """Scan a project root and register all source files as resources."""
        discovered = []
        for path in Path(root).rglob("*.py"):
            uri = f"file://{path}"
            self.register_resource(FileResource(
                uri=uri,
                name=str(path.relative_to(root)),
                description=f"Python source: {path.name}",
            ))
            discovered.append(uri)
        for path in Path(root).rglob("*.ts"):
            uri = f"file://{path}"
            self.register_resource(FileResource(
                uri=uri,
                name=str(path.relative_to(root)),
                description=f"TypeScript source: {path.name}",
            ))
            discovered.append(uri)
        logger.info(f"Discovered {len(discovered)} project file resources")
        return discovered

    # ── Prompt management ──────────────────────────────

    def register_prompt(self, prompt: MCPPrompt) -> None:
        self.prompts[prompt.name] = prompt
        logger.debug(f"MCP prompt registered: {prompt.name}")

    def list_prompts(self) -> list[dict]:
        """Return prompt metadata (MCP prompts/list)."""
        return [
            {
                "name": p.name,
                "description": p.description,
                "arguments": p.arguments,
            }
            for p in self.prompts.values()
        ]

    def get_prompt(self, name: str) -> MCPPrompt | None:
        """Get a prompt by name (MCP prompts/get)."""
        return self.prompts.get(name)

    def register_default_prompts(self) -> None:
        """Register standard built-in prompts."""
        defaults = [
            MCPPrompt(
                name="code_review",
                description="Review code for bugs, security, and style",
                template="Review the following {language} code:\n\n{code}\n\nFocus on: {focus}",
                arguments=[
                    {"name": "language", "description": "Programming language", "required": True},
                    {"name": "code", "description": "Code to review", "required": True},
                    {"name": "focus", "description": "Review focus areas (e.g. bugs, security, performance)", "required": False},
                ],
            ),
            MCPPrompt(
                name="generate_tests",
                description="Generate unit tests for code",
                template="Generate {language} unit tests for:\n\n{code}\n\nStyle: {style}",
                arguments=[
                    {"name": "language", "description": "Programming language", "required": True},
                    {"name": "code", "description": "Code to test", "required": True},
                    {"name": "style", "description": "Test style (e.g. pytest, jest)", "required": False},
                ],
            ),
            MCPPrompt(
                name="explain_code",
                description="Explain what code does",
                template="Explain the following {language} code:\n\n{code}\n\nAudience: {audience}",
                arguments=[
                    {"name": "language", "description": "Programming language", "required": True},
                    {"name": "code", "description": "Code to explain", "required": True},
                    {"name": "audience", "description": "Target audience (beginner/intermediate/expert)", "required": False},
                ],
            ),
            MCPPrompt(
                name="refactor",
                description="Refactor code for clarity and performance",
                template="Refactor this {language} code:\n\n{code}\n\nGoal: {goal}",
                arguments=[
                    {"name": "language", "description": "Programming language", "required": True},
                    {"name": "code", "description": "Code to refactor", "required": True},
                    {"name": "goal", "description": "Refactoring goal", "required": False},
                ],
            ),
        ]
        for p in defaults:
            self.register_prompt(p)
        logger.info(f"Registered {len(defaults)} default MCP prompts")


# ── Singleton ──────────────────────────────────────────

mcp_routes = MCPRoutes()
mcp_routes.register_default_prompts()
