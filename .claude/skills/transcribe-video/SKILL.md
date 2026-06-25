---
name: transcribe-video
description: Transcribe a local video/audio file (or URL) to text using the `scribe` CLI. Use when the user asks to transcribe a meetup recording, video, or audio file, or to produce a transcript before running /process-meetup.
user-invocable: true
allowed-tools:
  - Bash(scribe *)
  - Bash(ffmpeg *)
  - Bash(ls *)
  - Read
---

# /transcribe-video – Transcribe video/audio with scribe

Produces a plain-text transcript from a local video/audio file or a URL using
the `scribe` CLI (`/usr/local/bin/scribe`). Output feeds directly into
`/process-meetup`, `/create-article`, and `/extract-insights`.

## Input

The user provides the path to a local file (e.g.
`/Users/sbelyaev/Downloads/meetup.mp4`) or a URL (YouTube, etc.). If not
provided, ask for it.

## The tool

`scribe transcribe <input>` with key options:

- `--provider {openai,gemini}` – default is `gemini`.
- `--language LANGUAGE` – ISO code (`ru`, `en`) or `auto`. Default `ru`
  (community meetups are in Russian).
- `-o, --output PATH` – exact output path. Default `<stem>.txt`.
- `--rich` – [gemini only] structured JSON with summary, timestamped
  segments, translation, emotion.
- `--jobs N` – [openai] parallel chunk uploads for long files (default 4).

Keys for both providers are already stored (`scribe config show`).

## Provider choice – important

**Gemini inlines the whole input file and rejects anything large** with
`400 invalid_request`. Handing it a raw meetup `.mp4` (hundreds of MB) always
fails. The OpenAI provider, by contrast, extracts and compresses audio with
`ffmpeg` internally and chunks it, so it handles arbitrarily long files on its
own.

- **Large or long recordings (meetups, full videos): use `--provider openai`.**
  No pre-processing needed – it does the ffmpeg extraction and chunking.
- **Want Gemini (e.g. for `--rich` structured output) on a short clip:** you
  must first extract a small compressed audio file with `ffmpeg`, then point
  Gemini at that – see below.

**For full meetups, always use OpenAI – not Gemini, even with the ffmpeg
pre-step.** Tested on a 122-minute recording: single-shot Gemini transcribed
the first ~40 % cleanly, then fell into a repetition loop and stopped
mid-sentence, silently dropping the entire second half. The word count looked
fine (even higher than OpenAI's) because looped phrases inflated it – so length
is not a safety check. OpenAI's chunked path covered the whole meeting. Reserve
the Gemini path below for short clips (a few minutes) where `--rich` output is
worth it.

### Using Gemini on a short clip (ffmpeg pre-step)

Gemini does **not** extract audio itself, so feed it a compressed audio file
instead of the raw video. Extract mono 16 kHz Opus:

```
ffmpeg -y -i '<input>' -vn -ac 1 -ar 16000 -c:a libopus -b:a 16k '<stem>.ogg'
scribe transcribe '<stem>.ogg' --provider gemini --language ru -o '<stem>-transcript.txt'
```

Add `--rich` for the structured JSON (summary, timestamps, translation,
emotion). If the `.ogg` still exceeds the limit, lower the bitrate
(`-b:a 12k`) or split the audio. Put the temp `.ogg` in the scratchpad dir,
not next to the source.

## Steps

1. Confirm the input path exists (`ls -la`) and note its size.
2. Run the transcription **in the background** – long files take several
   minutes:

   ```
   scribe transcribe '<input>' --provider openai --language ru \
     -o '<stem>-transcript.txt'
   ```

3. Wait for completion, then verify the output file exists and is non-empty
   (`ls -la`, word count). If the file is missing, read the command output:
   a `400 invalid_request` from Gemini means retry with `--provider openai`.
4. Report the output path and a one-line summary (size / word count). Offer
   to run `/process-meetup` next if the recording is a community meetup.

## Notes

- Quote the input path – meetup filenames contain spaces and parentheses.
- Default output naming: place the transcript next to the source as
  `<stem>-transcript.txt` unless the user wants it elsewhere.
- The video file itself is large; do not read it. Only read the resulting
  `.txt` transcript.
