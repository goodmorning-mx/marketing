"""Validation and canonicalization for workspace-owned brand appearance assets."""
from __future__ import annotations

import base64
import binascii
import io
import math
import re
import warnings
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError
import resvg_py

MAX_INPUT_BYTES = 1024 * 1024
MAX_OUTPUT_BYTES = 1024 * 1024
MAX_DIMENSION = 1024
MAX_SVG_NODES = 1500
MAX_SVG_DEPTH = 32
SVG_NS = "http://www.w3.org/2000/svg"
SVG_TAGS = {
    "svg", "g", "defs", "linearGradient", "radialGradient", "stop",
    "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
}
SVG_ATTRS = {
    "xmlns", "id", "viewBox", "width", "height", "preserveAspectRatio",
    "x", "y", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2",
    "points", "d", "fill", "stroke", "stroke-width", "stroke-linecap",
    "stroke-linejoin", "fill-rule", "opacity", "fill-opacity", "stroke-opacity",
    "transform", "gradientUnits", "gradientTransform", "offset", "stop-color",
    "stop-opacity", "version",
}

@dataclass(frozen=True)
class CanonicalLogo:
    data: bytes
    media_type: str = "image/png"
    width: int = 0
    height: int = 0


def decode_logo(encoded: str, media_type: str) -> CanonicalLogo:
    if not isinstance(encoded, str) or len(encoded) > (MAX_INPUT_BYTES * 4 // 3 + 8):
        raise ValueError("Logo file is too large.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Logo file could not be read.") from exc
    if not raw or len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Logo file is too large.")
    if media_type == "image/svg+xml":
        return _canonicalize_svg(raw)
    formats = {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}
    if media_type not in formats:
        raise ValueError("Choose a PNG, JPEG, WebP, or supported static SVG logo.")
    return _canonicalize_raster(raw, formats[media_type])


def _canonicalize_raster(raw: bytes, expected_format: str | None = None) -> CanonicalLogo:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw), formats=["PNG", "JPEG", "WEBP"]) as probe:
                if probe.format not in {"PNG", "JPEG", "WEBP"} or (expected_format and probe.format != expected_format):
                    raise ValueError("Logo content does not match its declared image format.")
                if getattr(probe, "n_frames", 1) != 1:
                    raise ValueError("Animated logo files are not supported.")
                width, height = probe.size
                _validate_dimensions(width, height)
                probe.verify()
            with Image.open(io.BytesIO(raw), formats=["PNG", "JPEG", "WEBP"]) as source:
                source.load()
                image = ImageOps.exif_transpose(source).convert("RGBA")
                image.info.clear()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Choose a valid PNG, JPEG, WebP, or supported static SVG logo.") from exc
    return _png(image)


def _canonicalize_svg(raw: bytes) -> CanonicalLogo:
    if len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Logo file is too large.")
    try:
        source = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise ValueError("SVG logos must use UTF-8 text.") from exc
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)", source, flags=re.IGNORECASE):
        raise ValueError("SVG logos cannot contain document types or entities.")
    declaration = re.match(r"\A\s*<\?xml\s+version=(['\"])1\.[01]\1(?:\s+encoding=(['\"])UTF-8\2)?\s*\?>", source, re.IGNORECASE)
    without_declaration = source[:declaration.start()] + source[declaration.end():] if declaration else source
    if "<?" in without_declaration:
        raise ValueError("SVG logos cannot contain processing instructions.")
    try:
        root = ET.fromstring(source)
    except ET.ParseError as exc:
        raise ValueError("SVG logo markup is invalid.") from exc
    if root.tag != f"{{{SVG_NS}}}svg":
        raise ValueError("SVG logo must use the SVG namespace.")

    nodes = list(root.iter())
    if len(nodes) > MAX_SVG_NODES:
        raise ValueError("SVG logo contains too many elements.")
    ids: set[str] = set()
    refs: list[str] = []
    gradient_ids: set[str] = set()
    for node in nodes:
        if not isinstance(node.tag, str) or not node.tag.startswith(f"{{{SVG_NS}}}"):
            raise ValueError("SVG logo contains an unsupported namespace.")
        tag = node.tag.split("}", 1)[1]
        if tag not in SVG_TAGS:
            raise ValueError("SVG logo contains an unsupported element.")
        if node.text and node.text.strip():
            raise ValueError("SVG text and embedded content are not supported; convert lettering to paths.")
        if node.tail and node.tail.strip():
            raise ValueError("SVG text and embedded content are not supported; convert lettering to paths.")
        for attribute, value in node.attrib.items():
            if attribute.startswith("{"):
                raise ValueError("SVG logo contains namespaced attributes.")
            if attribute not in SVG_ATTRS:
                raise ValueError("SVG logo contains an unsupported attribute.")
            if len(value) > 100_000:
                raise ValueError("SVG logo contains an oversized attribute.")
            if attribute == "id":
                if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,63}", value) or value in ids:
                    raise ValueError("SVG logo contains an invalid or duplicate ID.")
                ids.add(value)
                if tag in {"linearGradient", "radialGradient"}:
                    gradient_ids.add(value)
            if attribute in {"fill", "stroke"} and value.startswith("url("):
                match = re.fullmatch(r"url\(#([A-Za-z][A-Za-z0-9_.-]{0,63})\)", value)
                if not match:
                    raise ValueError("SVG paint references must stay within the file.")
                refs.append(match.group(1))
            elif "url(" in value.lower() or "javascript:" in value.lower():
                raise ValueError("SVG logos cannot reference external content.")
            if attribute == "d" and not re.fullmatch(r"[\s,0-9eE.+\-MmLlHhVvCcSsQqTtAaZz]*", value):
                raise ValueError("SVG path data is not supported.")
            if attribute == "points" and not re.fullmatch(r"[\s,0-9eE.+\-]*", value):
                raise ValueError("SVG point data is not supported.")
            if attribute == "transform" and not re.fullmatch(r"[\s,0-9eE.+\-(),A-Za-z]*", value):
                raise ValueError("SVG transform is not supported.")
            if attribute in {"fill", "stroke", "stop-color"} and not value.startswith("url(") and not _safe_color(value):
                raise ValueError("SVG uses an unsupported color value.")
        child_tags = {child.tag.split("}", 1)[-1] for child in node if isinstance(child.tag, str)}
        geometry_tags = {"path", "rect", "circle", "ellipse", "line", "polyline", "polygon"}
        if tag in {"svg", "g"} and not child_tags.issubset(geometry_tags | {"g", "defs"}):
            raise ValueError("SVG logo contains an unsupported shape hierarchy.")
        if tag == "defs" and not child_tags.issubset({"linearGradient", "radialGradient"}):
            raise ValueError("SVG definitions may contain only gradients.")
        if tag in {"linearGradient", "radialGradient"} and not child_tags.issubset({"stop"}):
            raise ValueError("SVG gradients may contain only color stops.")
        if tag == "stop" and child_tags:
            raise ValueError("SVG color stops cannot contain child elements.")
        if tag in geometry_tags and child_tags:
            raise ValueError("SVG shapes cannot contain child elements.")
    if not set(refs).issubset(gradient_ids):
        raise ValueError("SVG paint references must point to a declared internal gradient.")
    if not _depth_ok(root, 0):
        raise ValueError("SVG logo is nested too deeply.")
    view_box = root.attrib.get("viewBox")
    if view_box:
        parts = re.split(r"[\s,]+", view_box.strip())
        try:
            x, y, width, height = map(float, parts)
        except (ValueError, TypeError) as exc:
            raise ValueError("SVG needs a valid viewBox.") from exc
        if len(parts) != 4 or not all(math.isfinite(value) and abs(value) <= 1_000_000 for value in (x, y, width, height)) or width <= 0 or height <= 0:
            raise ValueError("SVG needs a finite, bounded viewBox.")
    else:
        width = _svg_dimension(root.attrib.get("width"))
        height = _svg_dimension(root.attrib.get("height"))
        if not width or not height:
            raise ValueError("SVG needs a viewBox or fixed pixel dimensions.")
        root.set("viewBox", f"0 0 {width} {height}")
    if not math.isfinite(width) or not math.isfinite(height) or width > 1_000_000 or height > 1_000_000:
        raise ValueError("SVG logo dimensions must be finite and bounded.")
    render_width, render_height = _fit_dimensions(width, height)
    root.set("width", str(render_width))
    root.set("height", str(render_height))
    preserve = root.attrib.get("preserveAspectRatio", "xMidYMid meet")
    allowed_preserve = {"none", *(f"x{x}Y{y} {mode}" for x in ("Min", "Mid", "Max") for y in ("Min", "Mid", "Max") for mode in ("meet", "slice"))}
    if preserve not in allowed_preserve:
        raise ValueError("SVG aspect-ratio behavior is not supported.")
    root.set("preserveAspectRatio", "xMidYMid meet")
    safe_svg = ET.tostring(root, encoding="unicode")
    try:
        rendered = resvg_py.svg_to_bytes(svg_string=safe_svg, width=render_width, height=render_height, skip_system_fonts=True)
    except Exception as exc:
        raise ValueError("SVG logo could not be rendered.") from exc
    return _canonicalize_raster(rendered)


def _depth_ok(node: ET.Element, depth: int) -> bool:
    return depth <= MAX_SVG_DEPTH and all(_depth_ok(child, depth + 1) for child in node)


def _safe_color(value: str) -> bool:
    return bool(re.fullmatch(r"(?:#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{4}|#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8})|(?:none|transparent|currentColor|black|white|red|green|blue|gray|grey|yellow|purple|orange)", value))


def _svg_dimension(value: str | None) -> float | None:
    if not value or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?(?:px)?", value):
        return None
    return float(value.removesuffix("px"))


def _fit_dimensions(width: float, height: float) -> tuple[int, int]:
    scale = min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1.0)
    return max(1, round(width * scale)), max(1, round(height * scale))


def _validate_dimensions(width: int, height: int) -> None:
    if width < 1 or height < 1 or width > MAX_DIMENSION or height > MAX_DIMENSION or width * height > MAX_DIMENSION * MAX_DIMENSION:
        raise ValueError("Logo dimensions must be 1024 pixels or smaller.")


def _png(image: Image.Image) -> CanonicalLogo:
    width, height = image.size
    _validate_dimensions(width, height)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    data = output.getvalue()
    if len(data) > MAX_OUTPUT_BYTES:
        raise ValueError("Processed logo is too large to save.")
    return CanonicalLogo(data=data, width=width, height=height)
