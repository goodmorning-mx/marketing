"""Strict parser for the supported GIMP Palette text format."""
from __future__ import annotations

import re

MAX_PALETTE_BYTES = 16 * 1024
_COLOR_ROW = re.compile(r"^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+.*)?\s*$")


def parse_gpl(data: bytes, filename: str) -> tuple[str, list[str]]:
    if not isinstance(data, bytes) or not data or len(data) > MAX_PALETTE_BYTES:
        raise ValueError("Palette files must be between 1 byte and 16 KiB.")
    if not isinstance(filename, str) or not filename or len(filename) > 255 or any(ord(char) < 32 or ord(char) == 127 for char in filename) or "/" in filename or "\\" in filename:
        raise ValueError("Palette filename is invalid.")
    if not filename.lower().endswith(".gpl"):
        raise ValueError("Choose a GIMP Palette (.gpl) file.")
    try:
        source = data.decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError as exc:
        raise ValueError("GIMP Palette files must be valid UTF-8.") from exc
    lines = source.splitlines()
    if not lines or lines[0] != "GIMP Palette":
        raise ValueError("Palette file must start with the GIMP Palette header.")

    colors: list[str] = []
    saw_name = saw_columns = False
    for line in lines[1:]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("Name:"):
            if saw_name:
                raise ValueError("Palette file contains duplicate Name metadata.")
            saw_name = True
            continue
        if stripped.startswith("Columns:"):
            if saw_columns:
                raise ValueError("Palette file contains duplicate Columns metadata.")
            saw_columns = True
            value = stripped[len("Columns:"):].strip()
            if not re.fullmatch(r"(?:0|[1-9][0-9]{0,2})", value) or int(value) > 255:
                raise ValueError("Palette Columns metadata must be a positive integer.")
            continue
        match = _COLOR_ROW.fullmatch(line)
        if not match:
            raise ValueError("Palette contains an unsupported or malformed row.")
        values = tuple(int(value) for value in match.groups())
        if any(value > 255 for value in values):
            raise ValueError("Palette RGB values must be integers from 0 to 255.")
        colors.append("#" + "".join(f"{value:02X}" for value in values))
        if len(colors) > 5:
            raise ValueError("Custom palettes may contain from 1 to 5 colors.")
    if not colors:
        raise ValueError("Custom palettes must contain from 1 to 5 colors.")
    return filename, colors
