"""Portable JavaScript syntax check for macOS, Windows and Linux."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
for path in sorted((root / "addon").glob("*.js")):
    subprocess.run(["node", "--check", str(path)], check=True)
