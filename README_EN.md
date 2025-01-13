# WebRTC Audio Sync System | [English](README_EN.md) | [中文](README.md)

A WebRTC-based multi-device audio synchronization system that enables real-time synchronized audio playback across multiple devices.

## Features

- 🎵 Multi-device synchronized audio playback
- 🔄 Host-client architecture
- 📱 Quick join via QR code scanning
- ⚡ Automatic latency calibration
- 🎧 Support for local audio files and web audio capture
- 🔧 Manual latency fine-tuning
- 📊 Real-time latency monitoring
- 🔗 Device connection status tracking

## Tech Stack

- HTML5
- CSS3
- JavaScript (ES6+)
- WebRTC (PeerJS)
- QRCode.js
- HTML5-QRCode

## Quick Start

1. Open the web application
2. Choose your mode:
   - Host mode (Desktop)
   - Client mode (Mobile)

### Host Operations

1. Click "I'm the Host" button
2. Get the invitation code or display QR code
3. Select audio source:
   - Upload local audio file
   - Capture web audio
4. Wait for client connections
5. Use calibration feature to adjust latency
6. Start audio playback

### Client Operations

1. Click "I'm a Client" button
2. Join through:
   - Scan QR code
   - Enter 6-digit invitation code
3. Wait for connection
4. Receive and play synchronized audio

## Special Features

### Latency Calibration

- Automatic calibration: Click "Calibrate Latency" button for automatic measurement and adjustment
- Manual calibration: Fine-tune latency value manually (-1000ms to 1000ms)

### Device Management

- Real-time connected devices list
- Device connection status monitoring
- Per-device latency display

## Important Notes

1. Ensure all devices are connected to the same network
2. Host mode is recommended on desktop for optimal performance
3. Client mode supports mobile devices
4. Use modern browsers to ensure WebRTC functionality

## System Requirements

- Modern browser (with WebRTC support)
- Stable network connection
- Audio playback device

## License

MIT License 