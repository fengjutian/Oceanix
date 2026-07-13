"""Tool registration helpers.

Provides a single function to register all built-in tools
with a ToolService instance.
"""
from loguru import logger

from ..models.tool import ToolCategory, ToolParameter
from .builtin import read_file, write_file, grep_files, glob_files


def register_builtin_tools(tool_service) -> None:
    """Register all built-in Oceanix tools with the given ToolService."""

    # File tools
    tool_service.register_builtin(
        id="read_file",
        display_name="Read File",
        description="Read the contents of a file.",
        handler=read_file,
        category=ToolCategory.FILE,
        parameters=[ToolParameter(name="path", type="str", description="Path to the file")],
    )

    tool_service.register_builtin(
        id="write_file",
        display_name="Write File",
        description="Write content to a file. WARNING: this overwrites existing files.",
        handler=write_file,
        category=ToolCategory.FILE,
        parameters=[
            ToolParameter(name="path", type="str", description="Path to the file"),
            ToolParameter(name="content", type="str", description="Content to write"),
        ],
        requires_confirmation=True,  # file writes need user approval
    )

    # Search tools
    tool_service.register_builtin(
        id="grep_files",
        display_name="Grep Files",
        description="Search for text in files using regex or literal matching.",
        handler=grep_files,
        category=ToolCategory.SEARCH,
        parameters=[
            ToolParameter(name="query", type="str", description="Search query (regex or literal)"),
            ToolParameter(name="path", type="str", description="Directory to search (default: '.')"),
        ],
    )

    tool_service.register_builtin(
        id="glob_files",
        display_name="Glob Files",
        description="Find files matching a glob pattern (e.g. '*.py', 'src/**/*.ts').",
        handler=glob_files,
        category=ToolCategory.SEARCH,
        parameters=[
            ToolParameter(name="pattern", type="str", description="Glob pattern"),
            ToolParameter(name="path", type="str", description="Directory to search (default: '.')"),
        ],
    )

    logger.info(f"Registered {4} built-in tools")
