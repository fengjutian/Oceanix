"""Oceanix AI Server — FastMCP entry point."""
import sys
from loguru import logger

logger.remove()
logger.add(sys.stderr, level="INFO")

def main():
    """Entry point: oceanix-ai command."""
    logger.info("Oceanix AI Server starting...")
    print("Oceanix AI Server v0.1.0")

if __name__ == "__main__":
    main()
