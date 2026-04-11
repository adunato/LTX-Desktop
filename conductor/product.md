# Product Definition - LTX Desktop

## What is LTX Desktop?

LTX Desktop is an open-source desktop application for AI video generation using LTX models. It enables users to create, edit, and refine videos locally on supported Windows/Linux NVIDIA GPUs, with an API mode for unsupported hardware and macOS.

**Status**: Beta - Expect breaking changes. Frontend architecture is under active refactor.

## Target Users

- Content creators and video editors
- AI enthusiasts experimenting with video generation
- Professionals requiring local video generation capabilities
- Users with powerful NVIDIA GPUs (>=32GB VRAM) for local generation
- Users on any platform via API mode

## Core Features

### Generation Modes
- **Text-to-video**: Generate videos from text prompts
- **Image-to-video**: Animate still images into video
- **Audio-to-video**: Generate video synchronized with audio input
- **Video edit generation (Retake)**: Refine and regenerate existing video content

### Video Editor
- Full video editing interface with timeline
- Gap fill functionality
- Project-based workflow
- Visual composition tools

### Platform Support
| Platform | Mode | Requirements |
|----------|------|-------------|
| Windows + CUDA GPU >=32GB VRAM | Local generation | Downloads model weights locally |
| Linux + CUDA GPU >=32GB VRAM | Local generation | Downloads model weights locally |
| Windows (no CUDA / <32GB VRAM) | API-only | LTX API key required |
| Linux (no CUDA / <32GB VRAM) | API-only | LTX API key required |
| macOS (Apple Silicon) | API-only | LTX API key required |

## Key Integrations
- **LTX API**: Cloud text encoding, prompt enhancement, API-based generations
- **fal API** (optional): Z Image Turbo text-to-image generation
- **Gemini API** (optional): AI prompt suggestions

## System Requirements

### Local Generation (Windows/Linux)
- NVIDIA GPU with >=32GB VRAM
- 16GB+ RAM (32GB recommended)
- 160GB+ free disk space
- Windows 10/11 (x64) or Ubuntu 22.04+ (x64/arm64)

### API Mode (macOS / unsupported hardware)
- Apple Silicon (macOS) or any platform without CUDA GPU
- Stable internet connection
- LTX API key

## Data Locations
- **Windows**: `%LOCALAPPDATA%\LTXDesktop\`
- **macOS**: `~/Library/Application Support/LTXDesktop/`
- **Linux**: `$XDG_DATA_HOME/LTXDesktop/` (default: `~/.local/share/LTXDesktop/`)

## License
Apache-2.0
