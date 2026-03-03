"""
ffmpeg-based audio/video merger.
Mixes 3 audio layers (music, voice, sfx) into the final video.
"""
import os
import subprocess
import tempfile
from pathlib import Path


def merge_audio_video(
    video_path: str,
    output_path: str,
    music_path: str | None = None,
    voice_path: str | None = None,
    sfx_path: str | None = None,
    music_volume: float = 0.3,
    voice_volume: float = 0.9,
    sfx_volume: float = 0.5,
) -> None:
    """
    Merge audio layers into video using ffmpeg.

    Audio layers are optional — only provided layers are mixed.
    Output is trimmed/padded to match video duration.
    """
    # Probe video duration
    duration = _get_video_duration(video_path)

    inputs = ["-i", video_path]
    filter_parts = []
    audio_labels = []

    track_idx = 1  # video is index 0

    if music_path:
        inputs += ["-i", music_path]
        filter_parts.append(
            f"[{track_idx}:a]atrim=0:{duration},apad=whole_dur={duration},"
            f"volume={music_volume}[music]"
        )
        audio_labels.append("[music]")
        track_idx += 1

    if voice_path:
        inputs += ["-i", voice_path]
        filter_parts.append(
            f"[{track_idx}:a]atrim=0:{duration},apad=whole_dur={duration},"
            f"volume={voice_volume}[voice]"
        )
        audio_labels.append("[voice]")
        track_idx += 1

    if sfx_path:
        inputs += ["-i", sfx_path]
        filter_parts.append(
            f"[{track_idx}:a]atrim=0:{duration},apad=whole_dur={duration},"
            f"volume={sfx_volume}[sfx]"
        )
        audio_labels.append("[sfx]")
        track_idx += 1

    if not audio_labels:
        # No audio — just copy video as-is
        _run_ffmpeg(["-i", video_path, "-c", "copy", "-y", output_path])
        return

    n = len(audio_labels)
    mix_inputs = "".join(audio_labels)
    filter_parts.append(f"{mix_inputs}amix=inputs={n}:duration=first:normalize=0[aout]")
    filter_str = ";".join(filter_parts)

    cmd = (
        inputs
        + ["-filter_complex", filter_str]
        + ["-map", "0:v", "-map", "[aout]"]
        + ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k"]
        + ["-t", str(duration), "-y", output_path]
    )
    _run_ffmpeg(cmd)


def _get_video_duration(video_path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            video_path,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(result.stdout.strip())


def _run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg"] + args
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{result.stderr}")


def generate_thumbnail(video_path: str, output_path: str, time_offset: float = 1.0) -> None:
    """Extract a single frame from video as JPEG thumbnail."""
    _run_ffmpeg([
        "-i", video_path,
        "-ss", str(time_offset),
        "-vframes", "1",
        "-q:v", "2",
        "-y", output_path,
    ])
