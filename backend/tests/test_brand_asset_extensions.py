import pytest
import io
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.ttLib import TTFont

from app.brand_fonts import validate_font
from app.brand_palette import MAX_PALETTE_BYTES, parse_gpl


def test_gpl_parser_normalizes_rgb_and_ignores_labels():
    filename, colors = parse_gpl(
        b"\xef\xbb\xbfGIMP Palette\nName: Example\nColumns: 0\n# comment\n0 16 255 sky\n255 1 2\n",
        "example.gpl",
    )
    assert filename == "example.gpl"
    assert colors == ["#0010FF", "#FF0102"]


@pytest.mark.parametrize("data", [
    b"GIMP Palette\n256 0 0\n",
    b"GIMP Palette\n1 2\n",
    b"GIMP Palette\n" + b"1 2 3\n" * 6,
    b"GIMP Palette\n" + b"#" * MAX_PALETTE_BYTES,
    b"\xffGIMP Palette\n1 2 3\n",
])
def test_gpl_parser_rejects_malformed_or_oversized_inputs(data):
    with pytest.raises(ValueError):
        parse_gpl(data, "example.gpl")


def test_font_validator_requires_matching_complete_container():
    for filename, data in (("font.ttf", b"\x00\x01\x00\x00"), ("font.woff", b"wOFF"), ("font.woff2", b"wOF2"), ("font.otf", b"OTTO")):
        with pytest.raises(ValueError):
            validate_font(data, filename)
    with pytest.raises(ValueError):
        validate_font(b"wOFF", "font.ttf")


def _synthetic_font(is_ttf):
    builder = FontBuilder(1000, isTTF=is_ttf)
    glyph_order = [".notdef", "A"]
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap({65: "A"})
    if is_ttf:
        pen = TTGlyphPen(None)
        pen.moveTo((100, 0)); pen.lineTo((500, 700)); pen.lineTo((900, 0)); pen.closePath()
        builder.setupGlyf({".notdef": TTGlyphPen(None).glyph(), "A": pen.glyph()})
    else:
        char_strings = {}
        for glyph_name in glyph_order:
            pen = T2CharStringPen(600, None)
            if glyph_name == "A":
                pen.moveTo((100, 0)); pen.lineTo((500, 700)); pen.lineTo((900, 0)); pen.closePath()
            char_strings[glyph_name] = pen.getCharString()
        builder.setupCFF("Synthetic", {"FullName": "Synthetic Font", "FamilyName": "Synthetic", "Weight": "Regular"}, char_strings, {})
    builder.setupHorizontalMetrics({name: (600, 0) for name in glyph_order})
    builder.setupHorizontalHeader(ascent=800, descent=-200)
    builder.setupNameTable({"familyName": "Synthetic Font", "styleName": "Regular", "uniqueFontIdentifier": "SyntheticFont", "fullName": "Synthetic Font", "psName": "SyntheticFont"})
    builder.setupOS2(); builder.setupPost(); builder.setupMaxp(); builder.setupHead()
    output = io.BytesIO(); builder.save(output)
    return output.getvalue()


def test_font_validator_accepts_each_supported_single_face_container():
    for ttf, extension in ((True, ".ttf"), (False, ".otf")):
        source = _synthetic_font(ttf)
        for suffix, flavor, media_type in ((extension, None, "font/ttf" if ttf else "font/otf"), (".woff", "woff", "font/woff"), (".woff2", "woff2", "font/woff2")):
            font = TTFont(io.BytesIO(source))
            font.flavor = flavor
            output = io.BytesIO(); font.save(output)
            validated = validate_font(output.getvalue(), "synthetic" + suffix)
            assert validated.media_type == media_type
            assert validated.display_name == "Synthetic Font"
