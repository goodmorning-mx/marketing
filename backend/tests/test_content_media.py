from io import BytesIO

import pytest
from PIL import Image

from app.content_media import InvalidMedia, MAX_PHOTO_BYTES, safe_filename, validate_jpeg, validate_mp4


def jpeg(size=(400, 500)) -> bytes:
    image = Image.new("RGB", size, "steelblue")
    stream = BytesIO()
    image.save(stream, format="JPEG")
    return stream.getvalue()


def test_jpeg_is_decoded_and_instagram_ratio_is_enforced():
    assert validate_jpeg(jpeg(), ["facebook", "instagram"]) == {"width": 400, "height": 500}
    with pytest.raises(InvalidMedia, match="aspect ratio"):
        validate_jpeg(jpeg((1200, 400)), ["instagram"])
    assert validate_jpeg(jpeg((1200, 400)), ["facebook"]) == {"width": 1200, "height": 400}


def test_jpeg_and_reel_byte_caps_and_filename_sanitizing():
    with pytest.raises(InvalidMedia, match="8,000,000"):
        validate_jpeg(b"x" * (MAX_PHOTO_BYTES + 1), ["facebook"])
    with pytest.raises(InvalidMedia):
        validate_mp4(b"x" * (32 * 1024 * 1024 + 1))
    assert safe_filename("../../private\\name?.jpg") == "name_.jpg"


def test_malformed_and_non_jpeg_uploads_fail_closed():
    with pytest.raises(InvalidMedia):
        validate_jpeg(b"not an image", ["facebook"])
    ftyp = (16).to_bytes(4, "big") + b"ftypisom" + bytes(4)
    empty_box = (8).to_bytes(4, "big") + b"moov"
    mdat = (8).to_bytes(4, "big") + b"mdat"
    with pytest.raises(InvalidMedia):
        validate_mp4(ftyp + empty_box + mdat)
