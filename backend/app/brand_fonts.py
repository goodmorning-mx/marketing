"""Bounded validation for customer supplied, single-face brand fonts."""
from __future__ import annotations

import hashlib
import io
import re
import struct
from dataclasses import dataclass
from pathlib import PurePath

from fontTools.misc import sstruct
from fontTools.ttLib import TTFont, TTLibError
from fontTools.ttLib import sfnt, woff2

MAX_FONT_BYTES = 1024 * 1024
MAX_EXPANDED_BYTES = 8 * 1024 * 1024
MAX_FONT_TABLES = 128
MAX_GLYPHS = 65_535
FONT_TYPES = {
    ".woff": ("font/woff", b"wOFF"),
    ".woff2": ("font/woff2", b"wOF2"),
    ".ttf": ("font/ttf", (b"\x00\x01\x00\x00", b"true")),
    ".otf": ("font/otf", b"OTTO"),
}
SFNT_SIGNATURES = {b"\x00\x01\x00\x00", b"OTTO", b"true"}


class FontPolicyError(ValueError):
    """A bounded, intentional validation message suitable for users."""


@dataclass(frozen=True)
class ValidatedFont:
    data: bytes
    filename: str
    display_name: str
    media_type: str
    sha256: str


def validate_font(data: bytes, filename: str, declared_media_type: str | None = None) -> ValidatedFont:
    if not isinstance(data, bytes) or not data or len(data) > MAX_FONT_BYTES:
        raise ValueError("Font files must be between 1 byte and 1 MiB.")
    safe_filename = _safe_filename(filename)
    extension = PurePath(safe_filename).suffix.lower()
    definition = FONT_TYPES.get(extension)
    if definition is None:
        raise ValueError("Choose a WOFF, WOFF2, TTF, or OTF font file.")
    media_type, signature = definition
    # Browser MIME values are advisory only; the extension and file structure
    # determine the stored and served media type.
    if not (data.startswith(signature) if isinstance(signature, bytes) else data.startswith(signature)):
        raise ValueError("Font content does not match its filename format.")

    try:
        _preflight(data, extension)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("Font header or table directory is malformed.") from exc
    try:
        font = TTFont(io.BytesIO(data), lazy=False, checkChecksums=2, recalcBBoxes=False, recalcTimestamp=False)
        try:
            if str(font.reader.sfntVersion).encode("latin1") not in SFNT_SIGNATURES:
                raise FontPolicyError("Unsupported font container.")
            if "SVG " in font:
                raise FontPolicyError("Fonts with embedded SVG artwork are not supported.")
            font.ensureDecompiled()
            required = {"head", "maxp", "cmap", "name", "hhea", "hmtx"}
            if not required.issubset(font.keys()):
                raise FontPolicyError("Font is missing required renderable tables.")
            glyph_count = int(font["maxp"].numGlyphs)
            if glyph_count < 1 or glyph_count > MAX_GLYPHS:
                raise FontPolicyError("Font glyph count exceeds the supported limit.")
            flavor = font.reader.sfntVersion
            if flavor == "OTTO":
                if not ({"CFF ", "CFF2"} & set(font.keys())) or {"glyf", "loca"} & set(font.keys()):
                    raise FontPolicyError("Font outline tables do not match its container.")
            elif not {"glyf", "loca"}.issubset(font.keys()) or {"CFF ", "CFF2"} & set(font.keys()):
                raise FontPolicyError("Font outline tables do not match its container.")
            if not any(table.cmap for table in font["cmap"].tables):
                raise FontPolicyError("Font has no usable character map.")
            font_name = font["name"].getDebugName(16) or font["name"].getDebugName(1)
        finally:
            font.close()
    except FontPolicyError:
        raise
    except Exception as exc:
        raise ValueError("Font data is malformed or unsupported.") from exc

    display_name = _safe_display_name(font_name, safe_filename)
    return ValidatedFont(
        data=data,
        filename=safe_filename,
        display_name=display_name,
        media_type=media_type,
        sha256=hashlib.sha256(data).hexdigest(),
    )


def _preflight(data: bytes, extension: str) -> None:
    signature = data[:4]
    if signature == b"ttcf":
        raise ValueError("Font collections are not supported; choose a single-face font file.")
    if extension in {".woff", ".woff2"}:
        if extension == ".woff":
            _preflight_woff(data)
        else:
            _preflight_woff2(data)
        return
    _preflight_sfnt(data)


def _preflight_sfnt(data: bytes) -> None:
    if len(data) < 12:
        raise ValueError("Font header is incomplete.")
    signature, table_count, _search_range, _entry_selector, _range_shift = struct_unpack_sfnt(data)
    if signature not in SFNT_SIGNATURES:
        raise ValueError("Font content does not match its filename format.")
    if table_count < 1 or table_count > MAX_FONT_TABLES:
        raise ValueError("Font table count exceeds the supported limit.")
    directory_end = 12 + table_count * 16
    if directory_end > len(data):
        raise ValueError("Font table directory is incomplete.")
    ranges = []
    seen = set()
    expanded = 0
    for index in range(table_count):
        tag, _checksum, offset, length = struct_unpack_table(data, 12 + index * 16)
        _check_tag(tag, seen)
        expanded += length
        if expanded > MAX_EXPANDED_BYTES:
            raise ValueError("Expanded font data exceeds 8 MiB.")
        _add_range(ranges, offset, length, directory_end, len(data))
    _check_ranges(data, ranges, directory_end)


def _preflight_woff(data: bytes) -> None:
    header_size = sfnt.woffDirectorySize
    if len(data) < header_size:
        raise ValueError("WOFF header is incomplete.")
    header = sstruct.unpack(sfnt.woffDirectoryFormat, data[:header_size])
    if _as_bytes(header["signature"]) != b"wOFF" or header["length"] != len(data) or header["reserved"] != 0:
        raise ValueError("WOFF header is invalid.")
    if _as_bytes(header["sfntVersion"]) not in SFNT_SIGNATURES:
        raise ValueError("WOFF does not contain a supported single-face font.")
    if header["metaOffset"] or header["metaLength"] or header["metaOrigLength"] or header["privOffset"] or header["privLength"]:
        raise ValueError("WOFF metadata and private blocks are not supported.")
    _check_table_count(header["numTables"])
    directory_end = header_size + header["numTables"] * sfnt.woffDirectoryEntrySize
    if directory_end > len(data) or header["totalSfntSize"] > MAX_EXPANDED_BYTES:
        raise ValueError("WOFF directory or expanded font size exceeds the supported limit.")
    stream = io.BytesIO(data)
    stream.seek(header_size)
    ranges = []
    seen = set()
    expanded = 0
    for _ in range(header["numTables"]):
        entry = sfnt.WOFFDirectoryEntry()
        entry.fromFile(stream)
        _check_tag(entry.tag, seen)
        expanded += entry.origLength
        if expanded > MAX_EXPANDED_BYTES or entry.origLength > MAX_EXPANDED_BYTES:
            raise ValueError("Expanded font data exceeds 8 MiB.")
        if entry.length > entry.origLength:
            raise ValueError("WOFF table length is invalid.")
        _add_range(ranges, entry.offset, entry.length, directory_end, len(data))
    _check_ranges(data, ranges, directory_end)
    if header["totalSfntSize"] < 12 + header["numTables"] * 16 + expanded:
        raise ValueError("WOFF expanded size does not match its header.")


def _preflight_woff2(data: bytes) -> None:
    header_size = woff2.woff2DirectorySize
    if len(data) < header_size:
        raise ValueError("WOFF2 header is incomplete.")
    header = sstruct.unpack(woff2.woff2DirectoryFormat, data[:header_size])
    if _as_bytes(header["signature"]) != b"wOF2" or header["length"] != len(data) or header["reserved"] != 0:
        raise ValueError("WOFF2 header is invalid.")
    if _as_bytes(header["sfntVersion"]) not in SFNT_SIGNATURES:
        raise ValueError("WOFF2 does not contain a supported single-face font.")
    if header["metaOffset"] or header["metaLength"] or header["metaOrigLength"] or header["privOffset"] or header["privLength"]:
        raise ValueError("WOFF2 metadata and private blocks are not supported.")
    _check_table_count(header["numTables"])
    if header["totalSfntSize"] > MAX_EXPANDED_BYTES:
        raise ValueError("WOFF2 expanded font size exceeds 8 MiB.")
    stream = io.BytesIO(data)
    stream.seek(header_size)
    seen = set()
    transformed_total = 0
    original_total = 0
    for _ in range(header["numTables"]):
        entry = woff2.WOFF2DirectoryEntry()
        entry.fromFile(stream)
        _check_tag(entry.tag, seen)
        transformed_total += entry.length
        original_total += entry.origLength
        if transformed_total > MAX_EXPANDED_BYTES or original_total > MAX_EXPANDED_BYTES:
            raise ValueError("WOFF2 table data exceeds the 8 MiB expanded limit.")
    compressed_start = stream.tell()
    compressed_end = compressed_start + header["totalCompressedSize"]
    if compressed_end > len(data) or len(data) - compressed_end > 3 or any(data[compressed_end:]):
        raise ValueError("WOFF2 compressed stream length does not match its header.")
    if original_total + 12 + header["numTables"] * 16 > header["totalSfntSize"]:
        raise ValueError("WOFF2 expanded size does not match its table directory.")


def _check_table_count(count: int) -> None:
    if count < 1 or count > MAX_FONT_TABLES:
        raise ValueError("Font table count exceeds the supported limit.")


def _check_tag(tag: bytes | str, seen: set[str]) -> None:
    value = tag.decode("ascii") if isinstance(tag, bytes) else str(tag)
    if len(value) != 4 or value in seen:
        raise ValueError("Font table directory contains an invalid or duplicate tag.")
    if value == "SVG ":
        raise ValueError("Fonts with embedded SVG artwork are not supported.")
    seen.add(value)


def _add_range(ranges: list[tuple[int, int]], offset: int, length: int, directory_end: int, file_size: int) -> None:
    end = offset + length
    if length < 1 or offset % 4 or offset < directory_end or end > file_size:
        raise ValueError("Font table range is invalid.")
    ranges.append((offset, length))


def _check_ranges(data: bytes, ranges: list[tuple[int, int]], directory_end: int) -> None:
    cursor = directory_end
    for offset, length in sorted(ranges):
        if offset < cursor:
            raise ValueError("Font table ranges overlap.")
        if any(data[cursor:offset]):
            raise ValueError("Font contains unexplained data between tables.")
        cursor = offset + length
    if any(data[cursor:]):
        raise ValueError("Font contains unexplained trailing data.")


def _safe_filename(filename: str) -> str:
    if not isinstance(filename, str) or not filename or len(filename) > 255:
        raise ValueError("Font filename is invalid.")
    if any(ord(char) < 32 or ord(char) == 127 for char in filename) or "/" in filename or "\\" in filename:
        raise ValueError("Font filename is invalid.")
    return filename


def _as_bytes(value: bytes | str) -> bytes:
    return value if isinstance(value, bytes) else value.encode("latin1")


def _safe_display_name(name: str | None, filename: str) -> str:
    source = name or filename.rsplit(".", 1)[0]
    result = "".join(char for char in source if ord(char) >= 32 and ord(char) != 127).strip()
    result = re.sub(r"\s+", " ", result)[:100]
    return result or "Brand font"


def struct_unpack_sfnt(data: bytes) -> tuple[bytes, int, int, int, int]:
    return struct.unpack_from(">4sHHHH", data)


def struct_unpack_table(data: bytes, offset: int) -> tuple[bytes, int, int, int]:
    return struct.unpack_from(">4sIII", data, offset)
