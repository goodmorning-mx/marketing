import base64
import io

import pytest
from PIL import Image

from app.brand_assets import decode_logo


def _encoded(data):
    return base64.b64encode(data).decode("ascii")


def test_raster_upload_is_canonical_png_and_checks_declared_type():
    source = io.BytesIO()
    Image.new("RGB", (3, 2), "#2a6fff").save(source, format="JPEG")
    result = decode_logo(_encoded(source.getvalue()), "image/jpeg")
    assert result.media_type == "image/png"
    assert (result.width, result.height) == (3, 2)
    assert result.data.startswith(b"\x89PNG\r\n\x1a\n")
    with pytest.raises(ValueError, match="content does not match"):
        decode_logo(_encoded(source.getvalue()), "image/png")


def test_svg_upload_is_rendered_to_png_and_active_markup_is_rejected():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="20" height="10" fill="#204060"/></svg>'
    result = decode_logo(_encoded(svg), "image/svg+xml")
    assert result.media_type == "image/png"
    assert (result.width, result.height) == (20, 10)
    assert result.data.startswith(b"\x89PNG\r\n\x1a\n")
    active = svg.replace(b"<rect", b"<script>x</script><rect")
    with pytest.raises(ValueError, match="unsupported"):
        decode_logo(_encoded(active), "image/svg+xml")


def test_invalid_base64_and_oversized_files_are_rejected():
    with pytest.raises(ValueError, match="could not be read"):
        decode_logo("not base64!", "image/png")
    with pytest.raises(ValueError, match="too large"):
        decode_logo(_encoded(b"x" * (1024 * 1024 + 1)), "image/png")
