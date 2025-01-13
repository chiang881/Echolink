let peer = null;
let connection = null;
let audioPlayer = document.getElementById('audioPlayer');
let connectionStatus = document.getElementById('connectionStatus');
let audioInput = document.getElementById('audioInput');
let isHost = false;
let latency = 0; // 存储测得的延迟
let captureStream = null;
let mediaRecorder = null;
let audioCall = null; // 新增变量用于跟踪音频通话
let html5QrcodeScanner = null;
let latencyDisplay = document.getElementById('latencyDisplay');
let manualLatencyOffset = 0;
let deviceNumber = 0; // 设备序号
let connectedDevices = new Map(); // 存储连接的设备信息 {peerId: {deviceNumber, latency, manualOffset}}

// 添加固定延迟常量
const FIXED_DELAY = 100; // 固定延迟100ms

document.addEventListener('DOMContentLoaded', () => {
    // 初始化所有事件监听器和功能
    initializeEventListeners();
    initializeModeSelection();
    initializeQRCodeScanner();
    initializeCodeInput();
});

function initializeEventListeners() {
    // 复制邀请码功能
    const copyInviteCodeButton = document.getElementById('copyInviteCode');
    if (copyInviteCodeButton) {
        copyInviteCodeButton.addEventListener('click', async () => {
            const inviteCode = document.getElementById('inviteCode').textContent;
            try {
                await navigator.clipboard.writeText(inviteCode);
                copyInviteCodeButton.textContent = 'Copied ✅';
                copyInviteCodeButton.style.backgroundColor = '#27ae60';
                setTimeout(() => {
                    copyInviteCodeButton.textContent = '复制邀请码';
                    copyInviteCodeButton.style.backgroundColor = '#4CAF50';
                }, 1500);
            } catch (err) {
                console.error('复制失败:', err);
                copyInviteCodeButton.textContent = '复制失败';
                copyInviteCodeButton.style.backgroundColor = '#e74c3c';
                setTimeout(() => {
                    copyInviteCodeButton.textContent = '复制邀请码';
                    copyInviteCodeButton.style.backgroundColor = '#4CAF50';
                }, 1500);
            }
        });
    }
}

function initializeModeSelection() {
    const hostModeButton = document.getElementById('hostMode');
    const clientModeButton = document.getElementById('clientMode');

    if (hostModeButton) {
        hostModeButton.addEventListener('click', () => {
            isHost = true;
            initializeHost();
            showPanel('hostPanel');
        });
    }

    if (clientModeButton) {
        clientModeButton.addEventListener('click', () => {
            isHost = false;
            initializeClient();
            showPanel('clientPanel');
        });
    }
}

function initializeQRCodeScanner() {
    const scanQRBtn = document.getElementById('scanQRBtn');
    if (scanQRBtn) {
        scanQRBtn.addEventListener('click', async () => {
            const qrReader = document.getElementById('qr-reader');
            if (qrReader.style.display === 'none') {
                try {
                    if (!navigator.mediaDevices) {
                        navigator.mediaDevices = {};
                    }
                    if (!navigator.mediaDevices.getUserMedia) {
                        navigator.mediaDevices.getUserMedia = function(constraints) {
                            const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                            if (!getUserMedia) {
                                alert('您的浏览器不支持访问相机，请使用最新版本的Safari浏览器');
                                return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
                            }
                            return new Promise(function(resolve, reject) {
                                getUserMedia.call(navigator, constraints, resolve, reject);
                            });
                        }
                    }
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        video: { 
                            facingMode: "environment",
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        } 
                    });
                    stream.getTracks().forEach(track => track.stop());
                    qrReader.style.display = 'block';
                    html5QrcodeScanner = new Html5Qrcode("qr-reader");
                    const qrConfig = {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0
                    };
                    await html5QrcodeScanner.start(
                        { facingMode: "environment" },
                        qrConfig,
                        onScanSuccess,
                        onScanError
                    );
                } catch (err) {
                    console.error('相机访问错误:', err);
                    if (err.name === 'NotAllowedError') {
                        alert('请在设置中允许浏览器访问相机，然后重试');
                    } else if (err.name === 'NotFoundError') {
                        alert('未找到可用的相机设备');
                    } else if (err.name === 'NotSupportedError') {
                        alert('您的浏览器不支持访问相机，请使用最新版本的Safari浏览器');
                    } else {
                        alert('无法访问相机，请确保已授予相机权限，并使用 HTTPS 或 localhost 访问');
                    }
                }
            } else {
                stopScanner();
            }
        });
    }
}

function initializeCodeInput() {
    const codeInputs = document.querySelectorAll('.code-input');
    
    codeInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
            if (e.target.value) {
                input.classList.add('filled');
                if (index < codeInputs.length - 1) {
                    codeInputs[index + 1].focus();
                } else {
                    // 当最后一个输入框填写完成时，自动触发加入
                    const inviteCode = Array.from(codeInputs).map(input => input.value).join('');
                    if (inviteCode.length === 6) {
                        joinRoom(inviteCode);
                    }
                }
            } else {
                input.classList.remove('filled');
            }
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                codeInputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedText = e.clipboardData.getData('text').toUpperCase();
            if (pastedText.length === 6) {
                codeInputs.forEach((input, i) => {
                    input.value = pastedText[i] || '';
                    if (input.value) {
                        input.classList.add('filled');
                    }
                });
                // 粘贴完成后自动加入
                joinRoom(pastedText);
            }
        });
    });
}

function joinRoom(inviteCode) {
    if (!inviteCode) {
        connectionStatus.textContent = '请输入邀请码';
        return;
    }

    connectionStatus.textContent = '正在连接...';
    
    if (!peer.id) {
        // 如果 peer 还没有准备好，等待它准备好
        peer.on('open', () => {
            connectToPeer(inviteCode);
        });
    } else {
        // peer 已经准备好，直接连接
        connectToPeer(inviteCode);
    }
}

function connectToPeer(inviteCode) {
    try {
        connection = peer.connect(inviteCode);
        
        connection.on('open', () => {
            connectionStatus.textContent = '已连接';
            document.querySelector('.manual-calibration').style.display = 'block';
            
            // 设置数据处理
            connection.on('data', (data) => {
                if (data.type === 'audio') {
                    handleAudioData(data);
                } else if (data.type === 'control') {
                    handleControlCommand(data.command, data.currentTime, data.requestTime);
                } else if (data.type === 'ping') {
                    // 回复 pong 消息，包含设备序号
                    connection.send({
                        type: 'pong',
                        pingTime: data.timestamp,
                        deviceNumber: deviceNumber
                    });
                } else if (data.type === 'pong') {
                    // 处理 pong 消息
                    const currentTime = Date.now();
                    latency = currentTime - data.pingTime;
                    updateLatencyDisplay(latency, data.deviceNumber);
                } else if (data.type === 'deviceInfo') {
                    // 客户端接收设备序号
                    deviceNumber = data.deviceNumber;
                    const deviceNumberDisplay = document.getElementById('deviceNumber');
                    if (deviceNumberDisplay) {
                        deviceNumberDisplay.textContent = deviceNumber;
                    }
                }
            });
            
            startLatencyMeasurement();
        });

        connection.on('close', () => {
            connectionStatus.textContent = '连接已断开';
            connectionStatus.classList.remove('connected');
        });

        connection.on('error', (err) => {
            console.error('连接错误:', err);
            connectionStatus.textContent = '连接失败，请检查邀请码是否正确';
        });
    } catch (err) {
        console.error('连接失败:', err);
        connectionStatus.textContent = '连接失败，请重试';
    }
}

function showPanel(panelId) {
    // 隐藏所有面板
    document.querySelectorAll('.panel').forEach(panel => {
        panel.style.display = 'none';
        panel.classList.remove('active');
    });
    
    // 显示选中的面板
    const panel = document.getElementById(panelId);
    panel.style.display = 'block';
    setTimeout(() => panel.classList.add('active'), 50);
    
    // 根据不同模式显示不同功能
    if (panelId === 'hostPanel') {
        // 主机模式：显示音频控制和主机特有功能
        document.querySelector('.audio-controls').style.display = 'block';
        document.querySelector('.host-features').style.display = 'block';
    } else if (panelId === 'clientPanel') {
        // 客户端模式：只显示音频控制
        document.querySelector('.audio-controls').style.display = 'block';
        document.querySelector('.host-features').style.display = 'none';
    }
}

// 修改初始化主机函数
function initializeHost() {
    // 生成一个简短的随机ID作为邀请码
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    peer = new Peer(randomId, {
        config: {
            'iceServers': [
                { url: 'stun:stun.l.google.com:19302' }
            ]
        }
    });
    connectionStatus.textContent = '正在初始化...';
    
    peer.on('open', (id) => {
        const inviteCodeElement = document.getElementById('inviteCode');
        inviteCodeElement.textContent = id;
        generateQRCode(id);
        connectionStatus.textContent = '等待客户端连接...';
    });

    peer.on('connection', (conn) => {
        // 为新连接的设备分配序号
        deviceNumber++;
        const newDeviceNumber = deviceNumber;
        
        // 存储设备信息
        connectedDevices.set(conn.peer, {
            deviceNumber: newDeviceNumber,
            latency: 0,
            manualOffset: 0,
            connection: conn
        });
        
        // 更新设备列表显示
        if (isHost) {
            updateDevicesList();
            document.getElementById('devicesList').style.display = 'block';
        }
        
        // 通知客户端其设备序号
        conn.send({
            type: 'deviceInfo',
            deviceNumber: newDeviceNumber
        });
        
        // 设置连接
        setupConnection(conn, newDeviceNumber);
        
        // 监听连接关闭
        conn.on('close', () => {
            // 移除断开连接的设备
            connectedDevices.delete(conn.peer);
            updateDevicesList();
        });

        // 监听音频文件选择事件后发送媒体流
        audioInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file && isHost && !captureStream) {
                const audioURL = URL.createObjectURL(file);
                audioPlayer.src = audioURL;
                
                // 创建音频上下文和源
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaElementSource(audioPlayer);
                
                // 创建两个延迟节点：一个用于本地播放，一个用于发送
                const localDelayNode = audioContext.createDelay(5); // 最大5秒延迟
                const destination = audioContext.createMediaStreamDestination();
                
                // 设置本地播放路径（带延迟）
                source.connect(localDelayNode);
                localDelayNode.connect(audioContext.destination);
                
                // 设置发送路径（不带延迟）
                source.connect(destination);

                if (audioCall) {
                    audioCall.close();
                }
                audioCall = peer.call(conn.peer, destination.stream);
                
                // 存储延迟节点以便后续调整
                audioPlayer.delayNode = localDelayNode;
                
                // 立即应用当前的延迟设置
                updateDelayNode();
                
                audioCall.on('close', () => {
                    console.log('通话已关闭');
                    audioCall = null;
                });

                audioCall.on('error', (err) => {
                    console.error('通话错误:', err);
                    audioCall = null;
                });
            }
        });
    });

    peer.on('error', (err) => {
        console.error('连接错误:', err);
        if (err.type === 'unavailable-id') {
            // 如果ID已被使用，重新初始化
            initializeHost();
        } else {
            connectionStatus.textContent = '连接错误: ' + err.type;
        }
    });
}

// 修改初始化客户端函数
function initializeClient() {
    try {
        peer = new Peer();
        connectionStatus.textContent = '请输入邀请码';
        
        peer.on('open', () => {
            console.log('Peer 已就绪');
        });
        
        peer.on('call', (call) => {
            // 接收主机的媒体流
            call.answer();

            call.on('stream', (remoteStream) => {
                handleAudioStream(remoteStream);
            });

            call.on('close', () => {
                connectionStatus.textContent = '连接已断开';
                connectionStatus.classList.remove('connected');
                
                // 重置播放按钮
                const startPlayButton = document.getElementById('startPlayButton');
                if (startPlayButton) {
                    startPlayButton.classList.remove('playing');
                    startPlayButton.innerHTML = '<span class="icon">▶️</span><span class="text">开始播放</span>';
                    startPlayButton.disabled = true;
                }
            });

            call.on('error', (err) => {
                console.error('通话错误:', err);
                connectionStatus.textContent = '通话发生错误';
            });
        });

        peer.on('error', (err) => {
            console.error('连接错误:', err);
            connectionStatus.textContent = '连接错误: ' + err.type;
            // 重置连接
            connection = null;
        });
    } catch (err) {
        console.error('初始化客户端失败:', err);
        connectionStatus.textContent = '初始化失败，请刷新页面重试';
    }
}

// 设置连接
function setupConnection(conn, deviceNum = 0) {
    // 保存当前处理的连接
    connection = conn;

    // 设置数据处理
    connection.on('data', handleDataMessage);

    // 更新连接状态
    connectionStatus.textContent = '已连接';
    document.querySelector('.manual-calibration').style.display = 'block';
    
    // 更新设备序号显示
    const deviceNumberDisplay = document.getElementById('deviceNumber');
    if (deviceNumberDisplay) {
        deviceNumberDisplay.textContent = isHost ? 'Host' : deviceNum;
    }
    
    // 开始延迟测量
    startLatencyMeasurement();

    // 监听连接关闭
    connection.on('close', () => {
        connectionStatus.textContent = '连接已断开';
        connectionStatus.classList.remove('connected');
        connection = null;
    });

    // 监听连接错误
    connection.on('error', (err) => {
        console.error('连接错误:', err);
        connectionStatus.textContent = '连接错误: ' + err.type;
        connection = null;
    });
}

// 添加数据处理函数
function handleDataMessage(data) {
    if (!connection) return;

    if (data.type === 'audio') {
        handleAudioData(data);
    } else if (data.type === 'control') {
        handleControlCommand(data.command, data.currentTime, data.requestTime);
    } else if (data.type === 'ping') {
        // 回复 pong 消息，包含设备序号
        connection.send({
            type: 'pong',
            pingTime: data.timestamp,
            deviceNumber: deviceNumber
        });
    } else if (data.type === 'pong') {
        // 处理 pong 消息
        const currentTime = Date.now();
        latency = currentTime - data.pingTime;
        
        // 更新设备延迟信息
        if (isHost && connectedDevices.has(connection.peer)) {
            const deviceInfo = connectedDevices.get(connection.peer);
            deviceInfo.latency = latency;
            connectedDevices.set(connection.peer, deviceInfo);
        }
        
        updateLatencyDisplay(latency, data.deviceNumber);
    } else if (data.type === 'deviceInfo') {
        // 客户端接收设备序号
        deviceNumber = data.deviceNumber;
        const deviceNumberDisplay = document.getElementById('deviceNumber');
        if (deviceNumberDisplay) {
            deviceNumberDisplay.textContent = deviceNumber;
        }
    } else if (data.type === 'updateManualOffset') {
        // 主机接收客户端的手动偏移更新
        if (isHost && connectedDevices.has(connection.peer)) {
            const deviceInfo = connectedDevices.get(connection.peer);
            deviceInfo.manualOffset = data.manualOffset;
            connectedDevices.set(connection.peer, deviceInfo);
            updateDevicesList();
        }
    }
}

// 修改发送 ping 消息函数
function sendPing() {
    if (!connection || !connection.open) return;
    
    connection.send({
        type: 'ping',
        timestamp: Date.now(),
        deviceNumber: deviceNumber
    });
}

// 发送多个 ping 消息以测量平均延迟
async function measureLatency(count = 5) {
    let totalLatency = 0;
    const calibrateLatencyBtn = document.getElementById('calibrateLatencyBtn');
    
    if (calibrateLatencyBtn && calibrateLatencyBtn.disabled) {
        calibrateLatencyBtn.textContent = '校准中 0%';
    }
    
    for (let i = 0; i < count; i++) {
        await sendPing();
        totalLatency += latency;
        
        if (calibrateLatencyBtn && calibrateLatencyBtn.disabled) {
            const progress = Math.round((i + 1) / count * 100);
            calibrateLatencyBtn.textContent = `校准中 ${progress}%`;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    latency = Math.round(totalLatency / count);
    updateLatencyDisplay(latency, deviceNumber);
    updateDelayNode();
    
    if (isHost) {
        updateDevicesList();
    }
    
    console.log('延迟校准完成，当前延迟：', latency, 'ms');
    return latency;
}

function updateLatencyDisplay(value, deviceNum) {
    if (latencyDisplay) {
        const time = new Date().toLocaleTimeString();
        const dynamicLatency = value; // 动态延迟（测量值）
        const totalLatency = FIXED_DELAY + dynamicLatency + manualLatencyOffset; // 总延迟 = 固定延迟 + 动态延迟 + 手动校准
        
        if (isHost) {
            // 主机显示当前选中设备的延迟
            latencyDisplay.textContent = `当前设备延迟: ${totalLatency}ms [固定:${FIXED_DELAY}ms + 动态:${dynamicLatency}ms + 手动:${manualLatencyOffset}ms]`;
            // 更新设备列表
            updateDevicesList();
        } else {
            // 客户端显示自己的延迟
            latencyDisplay.textContent = `${totalLatency}ms [固定:${FIXED_DELAY}ms + 动态:${dynamicLatency}ms + 手动:${manualLatencyOffset}ms]`;
            // 更新客户端的手动校准输入框
            const manualLatencyInput = document.getElementById('manualLatency');
            if (manualLatencyInput) {
                manualLatencyInput.value = manualLatencyOffset;
            }
        }
        
        console.log(`设备${deviceNum} 延迟更新：${totalLatency}ms (固定:${FIXED_DELAY}ms + 动态:${dynamicLatency}ms + 手动:${manualLatencyOffset}ms)`);
    }
}

function handlePong(data) {
    const currentTime = Date.now();
    const pingTime = data.pingTime;
    latency = currentTime - pingTime;
    updateLatencyDisplay(latency, data.deviceNumber);
}

// 定期测量延迟
function startLatencyMeasurement() {
    // 立即进行一次校准
    measureLatency(5);
    
    // 每5秒自动校准一次
    setInterval(async () => {
        if (connection && connection.open) {
            await measureLatency(5);
            // 通知客户端延迟校准完成
            connection.send({
                type: 'control',
                command: 'latencyCalibrated',
                delay: latency
            });
        }
    }, 5000); // 每5秒校准一次
}

// 处理控制命令
function handleControlCommand(command, currentTime, requestTime, delay) {
    switch (command) {
        case 'disableAudioSending':
            if (audioPlayer.srcObject) {
                audioPlayer.pause();
                audioPlayer.srcObject = null;
            }
            if (audioCall) {
                audioCall.close();
                audioCall = null;
                console.log('已关闭本地音频通话');
            }
            break;
        case 'startPlay':
            // 客户端收到播放命令时
            if (!isHost) {
                audioPlayer.currentTime = currentTime;
                // 不要自动播放，让用户手动点击播放按钮
                const startPlayButton = document.getElementById('startPlayButton');
                if (startPlayButton) {
                    startPlayButton.disabled = false;
                }
                console.log('客户端音频已就绪，等待用户播放');
            }
            break;
        case 'latencyCalibrated':
            if (!isHost) {
                console.log('延迟校准完成，当前延迟：', delay, 'ms');
            }
            break;
    }
}

// 处理音频文件上传
function handleAudioData(data) {
    const arrayBuffer = data.audio;
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/*' });
    const audioUrl = URL.createObjectURL(audioBlob);
    audioPlayer.src = audioUrl;

    if (data.isPlaying && typeof data.currentTime === 'number') {
        audioPlayer.currentTime = data.currentTime;
        audioPlayer.play();
    }
}

// 添加"选择网页声音"按钮的事件监听
document.getElementById('captureAudioBtn').addEventListener('click', async () => {
    try {
        // 捕捉当前标签页的音频和视频
        captureStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        
        // 停止视频轨道，仅保留音频
        const videoTracks = captureStream.getVideoTracks();
        if (videoTracks.length > 0) {
            videoTracks[0].stop();
            captureStream.removeTrack(videoTracks[0]);
        }

        audioPlayer.srcObject = captureStream;
        audioPlayer.play();

        // 将音频流发送给手机端
        const call = peer.call(connection.peer, captureStream);
        
        call.on('close', () => {
            console.log('音频捕捉通话已关闭');
        });

        call.on('error', (err) => {
            console.error('音频捕捉通话错误:', err);
        });

        connectionStatus.textContent = '正在捕捉并发送音频';

        // 禁用本地音频发送
        connection.send({
            type: 'control',
            command: 'disableAudioSending'
        });
    } catch (err) {
        console.error('捕捉音频失败:', err);
        connectionStatus.textContent = '捕捉音频失败，请检查权限';
    }
});

// 生成二维码功能
function generateQRCode(inviteCode) {
    // 清除现有的二维码
    const qrcodeElement = document.getElementById('qrcode');
    qrcodeElement.innerHTML = '';
    
    // 直接使用邀请码作为二维码内容
    try {
        const qrcode = new QRCode(qrcodeElement, {
            text: inviteCode, // 直接使用邀请码
            width: 128,
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        
        console.log('二维码生成成功', {
            code: inviteCode,
            element: qrcodeElement
        });
    } catch (error) {
        console.error('生成二维码时出错:', error);
        qrcodeElement.textContent = '生成二维码失败，请刷新页面重试';
    }
}

// 在页面加载时检查 URL 是否包含邀请码
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
        // 如果 URL 包含邀请码，自动切换到客户端模式并填入邀请码
        document.getElementById('clientMode').click();
        
        // 填充验证码输入框
        const codeInputs = document.querySelectorAll('.code-input');
        code.split('').forEach((char, index) => {
            if (codeInputs[index]) {
                codeInputs[index].value = char.toUpperCase();
                codeInputs[index].classList.add('filled');
            }
        });
        
        // 自动加入房间
        joinRoom(code);
    }
});

// 扫描二维码按钮点击事件
document.getElementById('scanQRBtn').addEventListener('click', async () => {
    const qrReader = document.getElementById('qr-reader');
    
    if (qrReader.style.display === 'none') {
        try {
            // 检查 mediaDevices API 是否可用
            if (!navigator.mediaDevices) {
                // 对于 iOS Safari，需要先检查是否支持 getUserMedia
                navigator.mediaDevices = {};
            }
            
            // 添加 getUserMedia 的兼容性处理
            if (!navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia = function(constraints) {
                    const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                    
                    if (!getUserMedia) {
                        alert('您的浏览器不支持访问相机，请使用最新版本的Safari浏览器');
                        return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
                    }
                    
                    return new Promise(function(resolve, reject) {
                        getUserMedia.call(navigator, constraints, resolve, reject);
                    });
                }
            }
            
            // 请求相机权限
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            
            // 获取权限后立即停止预览流
            stream.getTracks().forEach(track => track.stop());
            
            // 显示扫描器
            qrReader.style.display = 'block';
            
            // 初始化扫描器
            html5QrcodeScanner = new Html5Qrcode("qr-reader");
            
            const qrConfig = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };
            
            await html5QrcodeScanner.start(
                { facingMode: "environment" },
                qrConfig,
                onScanSuccess,
                onScanError
            );
            
        } catch (err) {
            console.error('相机访问错误:', err);
            if (err.name === 'NotAllowedError') {
                alert('请在设置中允许浏览器访问相机，然后重试');
            } else if (err.name === 'NotFoundError') {
                alert('未找到可用的相机设备');
            } else if (err.name === 'NotSupportedError') {
                alert('您的浏览器不支持访问相机，请使用最新版本的Safari浏览器');
            } else {
                alert('无法访问相机，请确保已授予相机权限，并使用 HTTPS 或 localhost 访问');
            }
        }
    } else {
        // 停止并隐藏扫描器
        stopScanner();
    }
});

// 扫描成功回调
function onScanSuccess(decodedText) {
    stopScanner();
    
    // 填充验证码输入框
    const codeInputs = document.querySelectorAll('.code-input');
    const code = decodedText.slice(0, 6).toUpperCase();
    
    codeInputs.forEach((input, index) => {
        input.value = code[index] || '';
        if (input.value) {
            input.classList.add('filled');
        }
    });
    
    // 直接调用 joinRoom 函数
    joinRoom(code);
}

// 扫描错误回调
function onScanError(err) {
    // console.error(err);
    // 这里我们不需要显示错误，因为可能会频繁触发
}

// 停止扫描器
function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            document.getElementById('qr-reader').style.display = 'none';
            html5QrcodeScanner = null;
        }).catch((err) => {
            console.error('停止扫描器失败:', err);
        });
    }
}

// 添加音频播放器的事件监听
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    
    // 添加音频播放器的事件监听
    audioPlayer.addEventListener('play', () => {
        if (isHost && connection && connection.open) {
            // 计算总延迟：固定延迟 + 动态延迟 + 手动校准
            const totalDelay = (FIXED_DELAY + latency + manualLatencyOffset) / 1000;
            if (audioPlayer.delayNode) {
                audioPlayer.delayNode.delayTime.value = totalDelay;
                console.log('设置本地播放延迟：', totalDelay, '秒');
            }

            // 发送播放命令给客户端
            connection.send({
                type: 'control',
                command: 'startPlay',
                currentTime: audioPlayer.currentTime
            });
        }
    });
});

// 添加校准延迟和校准播放功能
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    
    // 校准延迟按钮
    const calibrateLatencyBtn = document.getElementById('calibrateLatencyBtn');
    if (calibrateLatencyBtn) {
        calibrateLatencyBtn.addEventListener('click', async () => {
            if (isHost && connection && connection.open) {
                calibrateLatencyBtn.disabled = true;
                calibrateLatencyBtn.textContent = '校准中...';
                
                // 进行5次延迟测量
                await measureLatency(5);
                
                calibrateLatencyBtn.disabled = false;
                calibrateLatencyBtn.innerHTML = '<span class="icon">⚡</span><span class="text">校准延迟</span>';
                
                // 通知客户端延迟校准完成
                connection.send({
                    type: 'control',
                    command: 'latencyCalibrated',
                    delay: latency
                });
            }
        });
    }
    
    // 校准播放按钮
    const calibratePlayBtn = document.getElementById('calibratePlayBtn');
    if (calibratePlayBtn) {
        calibratePlayBtn.addEventListener('click', async () => {
            if (isHost && connection && connection.open && audioPlayer.src) {
                calibratePlayBtn.disabled = true;
                
                // 先进行一次延迟校准
                await measureLatency(5);
                
                // 执行校准播放
                handleCalibrationPlay();
                
                calibratePlayBtn.disabled = false;
            } else {
                alert('请先选择音频文件');
            }
        });
    }
});

// 修改手动校准功能
document.addEventListener('DOMContentLoaded', () => {
    const manualLatencyInput = document.getElementById('manualLatency');
    const applyLatencyBtn = document.getElementById('applyLatency');
    
    if (manualLatencyInput && applyLatencyBtn) {
        // 应用按钮点击事件
        applyLatencyBtn.addEventListener('click', () => {
            if (!connection) return;
            
            const newOffset = parseInt(manualLatencyInput.value) || 0;
            manualLatencyOffset = newOffset;
            
            // 如果是主机，更新设备信息
            if (isHost && connection && connectedDevices.has(connection.peer)) {
                const deviceInfo = connectedDevices.get(connection.peer);
                deviceInfo.manualOffset = newOffset;
                connectedDevices.set(connection.peer, deviceInfo);
            }
            
            // 如果是客户端，通知主机更新延迟
            if (!isHost && connection.open) {
                connection.send({
                    type: 'updateManualOffset',
                    deviceNumber: deviceNumber,
                    manualOffset: newOffset
                });
            }
            
            updateLatencyDisplay(latency, deviceNumber);
            updateDelayNode();
        });
        
        // 输入框回车事件
        manualLatencyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                applyLatencyBtn.click();
            }
        });
    }
});

// 修改日志输出
console.log = (function(originalLog) {
    return function(...args) {
        const deviceInfo = deviceNumber ? `[设备${deviceNumber}] ` : '[主机] ';
        originalLog.apply(console, [deviceInfo, ...args]);
    };
})(console.log);

// 添加更新设备列表显示的函数
function updateDevicesList() {
    if (!isHost) return;
    
    const devicesInfo = document.getElementById('devicesInfo');
    if (!devicesInfo) return;
    
    devicesInfo.innerHTML = '';
    
    connectedDevices.forEach((device, peerId) => {
        const deviceDiv = document.createElement('div');
        deviceDiv.className = 'device-info';
        
        const dynamicLatency = device.latency;
        const totalLatency = FIXED_DELAY + dynamicLatency + device.manualOffset;
        const time = new Date().toLocaleTimeString();
        
        deviceDiv.innerHTML = `
            <div class="device-header">
                设备${device.deviceNumber} - 
                总延迟: ${totalLatency}ms 
                [固定:${FIXED_DELAY}ms + 动态:${dynamicLatency}ms + 手动:${device.manualOffset}ms]
                (${time})
            </div>
            <div class="device-calibration">
                <input type="number" class="manual-latency-input" 
                    value="${device.manualOffset}" 
                    min="-1000" max="1000" step="1" 
                    data-peer-id="${peerId}"
                    data-device-number="${device.deviceNumber}">
                <button class="apply-latency-btn" 
                    data-peer-id="${peerId}"
                    data-device-number="${device.deviceNumber}">应用</button>
                ms
            </div>
        `;
        
        devicesInfo.appendChild(deviceDiv);
        
        // 为新添加的控件绑定事件
        const input = deviceDiv.querySelector('.manual-latency-input');
        const applyBtn = deviceDiv.querySelector('.apply-latency-btn');
        
        if (input && applyBtn) {
            applyBtn.addEventListener('click', () => {
                const newOffset = parseInt(input.value) || 0;
                const deviceInfo = connectedDevices.get(peerId);
                if (deviceInfo) {
                    deviceInfo.manualOffset = newOffset;
                    connectedDevices.set(peerId, deviceInfo);
                    
                    // 如果是当前选中的设备，更新主界面显示
                    if (connection && connection.peer === peerId) {
                        manualLatencyOffset = newOffset;
                        updateLatencyDisplay(deviceInfo.latency, deviceInfo.deviceNumber);
                        updateDelayNode();
                    }
                    
                    // 通知客户端更新延迟
                    const conn = deviceInfo.connection;
                    if (conn && conn.open) {
                        conn.send({
                            type: 'updateManualOffset',
                            manualOffset: newOffset
                        });
                    }
                    
                    // 更新设备列表显示
                    updateDevicesList();
                }
            });
            
            // 添加回车键支持
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    applyBtn.click();
                }
            });
        }
    });
}

// 添加播放控制功能
document.addEventListener('DOMContentLoaded', () => {
    const startPlayButton = document.getElementById('startPlayButton');
    const audioPlayer = document.getElementById('audioPlayer');

    if (startPlayButton && audioPlayer) {
        startPlayButton.addEventListener('click', async () => {
            try {
                if (audioPlayer.paused) {
                    // 尝试播放
                    await audioPlayer.play();
                    startPlayButton.classList.add('playing');
                    startPlayButton.innerHTML = '<span class="icon">⏸</span><span class="text">暂停</span>';
                } else {
                    audioPlayer.pause();
                    startPlayButton.classList.remove('playing');
                    startPlayButton.innerHTML = '<span class="icon">▶️</span><span class="text">开始播放</span>';
                }
            } catch (err) {
                console.error('播放失败:', err);
                alert('播放失败，请检查浏览器设置或重试');
            }
        });
    }
});

// 修改音频流处理函数
function handleAudioStream(stream) {
    try {
        audioPlayer.srcObject = stream;
        // 不要自动播放，等待用户点击播放按钮
        audioPlayer.autoplay = false;
        
        // 更新播放按钮状态
        const startPlayButton = document.getElementById('startPlayButton');
        if (startPlayButton) {
            startPlayButton.style.display = 'block';
            startPlayButton.disabled = false;
        }
        
        connectionStatus.textContent = '音频已就绪，请点击播放';
    } catch (err) {
        console.error('处理音频流失败:', err);
        connectionStatus.textContent = '处理音频流失败';
    }
}

// 修改客户端的音频处理
peer.on('call', (call) => {
    // 接收主机的媒体流
    call.answer();

    call.on('stream', (remoteStream) => {
        handleAudioStream(remoteStream);
    });

    call.on('close', () => {
        connectionStatus.textContent = '连接已断开';
        connectionStatus.classList.remove('connected');
        
        // 重置播放按钮
        const startPlayButton = document.getElementById('startPlayButton');
        if (startPlayButton) {
            startPlayButton.classList.remove('playing');
            startPlayButton.innerHTML = '<span class="icon">▶️</span><span class="text">开始播放</span>';
            startPlayButton.disabled = true;
        }
    });

    call.on('error', (err) => {
        console.error('通话错误:', err);
        connectionStatus.textContent = '通话发生错误';
    });
});

// 修改音频播放器事件监听
audioPlayer.addEventListener('play', () => {
    const startPlayButton = document.getElementById('startPlayButton');
    if (startPlayButton) {
        startPlayButton.classList.add('playing');
        startPlayButton.innerHTML = '<span class="icon">⏸</span><span class="text">暂停</span>';
    }
    
    if (isHost && connection && connection.open) {
        // 计算总延迟：固定延迟 + 动态延迟 + 手动校准
        const totalDelay = (FIXED_DELAY + latency + manualLatencyOffset) / 1000;
        if (audioPlayer.delayNode) {
            audioPlayer.delayNode.delayTime.value = totalDelay;
            console.log('设置本地播放延迟：', totalDelay, '秒');
        }

        // 发送播放命令给客户端
        connection.send({
            type: 'control',
            command: 'startPlay',
            currentTime: audioPlayer.currentTime
        });
    }
});

audioPlayer.addEventListener('pause', () => {
    const startPlayButton = document.getElementById('startPlayButton');
    if (startPlayButton) {
        startPlayButton.classList.remove('playing');
        startPlayButton.innerHTML = '<span class="icon">▶️</span><span class="text">开始播放</span>';
    }
});

// 修改处理控制命令的函数
function handleControlCommand(command, currentTime, requestTime, delay) {
    switch (command) {
        case 'disableAudioSending':
            if (audioPlayer.srcObject) {
                audioPlayer.pause();
                audioPlayer.srcObject = null;
            }
            if (audioCall) {
                audioCall.close();
                audioCall = null;
                console.log('已关闭本地音频通话');
            }
            break;
        case 'startPlay':
            // 客户端收到播放命令时
            if (!isHost) {
                audioPlayer.currentTime = currentTime;
                // 不要自动播放，让用户手动点击播放按钮
                const startPlayButton = document.getElementById('startPlayButton');
                if (startPlayButton) {
                    startPlayButton.disabled = false;
                }
                console.log('客户端音频已就绪，等待用户播放');
            }
            break;
        case 'latencyCalibrated':
            if (!isHost) {
                console.log('延迟校准完成，当前延迟：', delay, 'ms');
            }
            break;
    }
}