"""Bounded validation for private customer campaign media."""

import json
import os
import re
import shutil
import subprocess
import warnings
from io import BytesIO
from pathlib import PurePath

from PIL import Image, UnidentifiedImageError

MAX_PHOTO_BYTES = 8_000_000
MAX_REEL_BYTES = 32 * 1024 * 1024
MAX_WORKSPACE_BYTES = 256 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000


class InvalidMedia(ValueError):
    pass


def safe_filename(value: str) -> str:
    name = PurePath((value or "upload").replace("\\", "/")).name
    name = re.sub(r"[^A-Za-z0-9._ -]+", "_", name).strip(" .")[:160]
    return name or "upload"


def _mp4_boxes(data: bytes) -> list[tuple[bytes, int, int]]:
    boxes = []
    offset = 0
    while offset + 8 <= len(data):
        size = int.from_bytes(data[offset:offset + 4], "big")
        kind = data[offset + 4:offset + 8]
        header = 8
        if size == 1:
            if offset + 16 > len(data):
                raise InvalidMedia("The MP4 container is malformed.")
            size = int.from_bytes(data[offset + 8:offset + 16], "big")
            header = 16
        elif size == 0:
            size = len(data) - offset
        if size < header or offset + size > len(data):
            raise InvalidMedia("The MP4 container is malformed.")
        boxes.append((kind, offset, size))
        if len(boxes) > 100_000:
            raise InvalidMedia("The MP4 container has too many boxes to inspect safely.")
        offset += size
    if offset != len(data):
        raise InvalidMedia("The MP4 container is malformed.")
    return boxes


def _child_boxes(data: bytes) -> list[tuple[bytes, int, int]]:
    return _mp4_boxes(data)


def validate_jpeg(data: bytes, platforms: list[str]) -> dict:
    if not data or len(data) > MAX_PHOTO_BYTES:
        raise InvalidMedia("JPEG files must be no larger than 8,000,000 bytes.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format != "JPEG":
                    raise InvalidMedia("Choose a JPEG image.")
                width, height = image.size
                if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                    raise InvalidMedia("The image dimensions are too large to preview safely.")
                image.verify()
            with Image.open(BytesIO(data)) as image:
                image.load()
                width, height = image.size
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning, ValueError) as exc:
        if isinstance(exc, InvalidMedia):
            raise
        raise InvalidMedia("The JPEG image could not be decoded safely.") from exc
    if width * height > MAX_IMAGE_PIXELS:
        raise InvalidMedia("The image dimensions are too large to preview safely.")
    if "instagram" in platforms and not (0.8 <= width / height <= 1.91):
        raise InvalidMedia("Instagram photos must use a 4:5 to 1.91:1 aspect ratio.")
    return {"width": width, "height": height}


def validate_mp4(data: bytes) -> dict:
    if not data or len(data) > MAX_REEL_BYTES:
        raise InvalidMedia("MP4 Reels must be no larger than 32 MiB.")
    boxes = _mp4_boxes(data)
    names = [box[0] for box in boxes]
    if not names or names[0] != b"ftyp" or b"moov" not in names or b"mdat" not in names or names.index(b"moov") > names.index(b"mdat"):
        raise InvalidMedia("Choose a progressive MP4 file with its movie header before the media data.")
    ftyp_kind, ftyp_offset, ftyp_size = boxes[0]
    ftyp_major = data[ftyp_offset + 8:ftyp_offset + 12]
    if ftyp_major not in {b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"dash"}:
        raise InvalidMedia("Choose an ISO MP4 file.")
    moov_kind, moov_offset, moov_size = boxes[names.index(b"moov")]
    moov_children = _child_boxes(data[moov_offset + 8:moov_offset + moov_size])
    for child_kind, child_offset, child_size in moov_children:
        if child_kind == b"trak":
            track_children = _child_boxes(data[moov_offset + 8 + child_offset:moov_offset + 8 + child_offset + child_size])
            if any(kind == b"edts" for kind, _offset, _size in track_children):
                raise InvalidMedia("MP4 edit lists are not supported for Reels.")
    executable = shutil.which("ffprobe")
    if not executable:
        raise InvalidMedia("Video validation is unavailable. Try again later.")
    args = [executable, "-v", "error", "-protocol_whitelist", "pipe", "-enable_drefs", "0", "-use_absolute_path", "0",
            "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,display_aspect_ratio,field_order,pix_fmt,avg_frame_rate,sample_rate,channels:stream_side_data=rotation",
            "-of", "json", "-f", "mov", "-i", "pipe:0"]
    try:
        result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=8, check=False, close_fds=True, env={"PATH": os.path.dirname(executable)})
        if result.returncode != 0 or len(result.stdout) > 128 * 1024:
            raise InvalidMedia("The MP4 file could not be inspected safely.")
        info = json.loads(result.stdout)
    except (subprocess.TimeoutExpired, OSError, json.JSONDecodeError) as exc:
        raise InvalidMedia("The MP4 file could not be inspected safely.") from exc
    streams = info.get("streams", [])
    videos = [stream for stream in streams if stream.get("codec_type") == "video"]
    audios = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(videos) != 1 or len(audios) > 1:
        raise InvalidMedia("A Reel must contain one video track and at most one audio track.")
    video = videos[0]
    if video.get("codec_name") not in {"h264", "hevc"} or video.get("field_order") != "progressive" or video.get("pix_fmt") not in {"yuv420p", "yuvj420p"}:
        raise InvalidMedia("Reels require progressive H.264 or HEVC video in 4:2:0 format.")
    try:
        numerator, denominator = (int(part) for part in video["avg_frame_rate"].split("/", 1))
        fps = numerator / denominator
        duration = float(info["format"]["duration"])
        width, height = int(video["width"]), int(video["height"])
    except (KeyError, ValueError, ZeroDivisionError, TypeError) as exc:
        raise InvalidMedia("The MP4 video properties could not be validated.") from exc
    rotation = 0
    for side_data in video.get("side_data_list", []):
        try:
            rotation = int(float(side_data.get("rotation", 0))) % 360
        except (ValueError, TypeError):
            continue
    display_width = height if rotation in {90, 270} else width
    display_height = width if rotation in {90, 270} else height
    if width <= 0 or height <= 0 or not 23 <= fps <= 60 or display_width > 1920 or not 3 <= duration <= 900:
        raise InvalidMedia("Reels must be 3–900 seconds, 23–60 fps, and no wider than 1920 pixels.")
    if audios:
        audio = audios[0]
        try:
            sample_rate, channels = int(audio["sample_rate"]), int(audio["channels"])
        except (KeyError, ValueError, TypeError) as exc:
            raise InvalidMedia("The Reel audio properties could not be validated.") from exc
        if audio.get("codec_name") != "aac" or channels not in {1, 2} or sample_rate > 48000:
            raise InvalidMedia("Reel audio must be AAC, mono or stereo, at no more than 48 kHz.")
    return {"width": display_width, "height": display_height, "duration_seconds": duration, "fps": fps,
            "video_codec": video["codec_name"], "audio_tracks": len(audios)}
