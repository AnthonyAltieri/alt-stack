from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from runpy import run_path
from urllib.request import urlopen

from .to_python import openapi_to_pydantic_code


def _load_schema(source: str) -> dict[str, object]:
    if source.startswith("http://") or source.startswith("https://"):
        with urlopen(source) as response:  # nosec - user-provided URL
            return json.loads(response.read().decode("utf-8"))
    return json.loads(Path(source).read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python-zod-openapi",
        description="Generate Pydantic models from an OpenAPI schema",
    )
    parser.add_argument("input", help="OpenAPI schema file path or URL")
    parser.add_argument(
        "-o",
        "--output",
        default="generated-types.py",
        help="Output file path",
    )
    parser.add_argument(
        "-r",
        "--registry",
        help="Registry file that registers custom schemas",
    )
    parser.add_argument(
        "-i",
        "--include",
        help="Python file to include at top of generated output",
    )

    args = parser.parse_args()

    try:
        if args.registry:
            run_path(args.registry)

        include_content = None
        if args.include:
            include_content = Path(args.include).read_text(encoding="utf-8")

        schema = _load_schema(args.input)
        custom_lines = [include_content] if include_content else None
        code = openapi_to_pydantic_code(
            schema,
            custom_import_lines=custom_lines,
            options={"include_routes": True},
        )
        Path(args.output).write_text(code, encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
