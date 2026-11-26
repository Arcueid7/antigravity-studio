#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Run the complete pre-release verification suite (bytecode check + all unittest modules)."""

from __future__ import annotations

import compileall
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    print("[1/2] Checking Python syntax & bytecode compilation...")
    ok_compile = all(
        compileall.compile_dir(str(ROOT / d), quiet=1)
        for d in ("backend", "tests")
    ) and compileall.compile_file(str(ROOT / "server.py"), quiet=1)
    if not ok_compile:
        print("FAIL: Python syntax/compilation error detected.")
        return 1

    print("[2/2] Running full unittest suite (unit + HTTP/SSE integration + frontend/release checks)...")
    loader = unittest.defaultTestLoader
    suite = loader.discover(start_dir=str(ROOT / "tests"), pattern="test_*.py", top_level_dir=str(ROOT))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
