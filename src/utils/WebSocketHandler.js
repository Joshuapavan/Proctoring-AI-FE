export class VideoStreamManager {
    constructor(wsUrl, token, userId) {
        this.baseWsUrl = wsUrl;
        this.token = token;
        this.userId = userId;
        this.socket = null;
        this.stream = null;
        this.videoElement = null;
        this.mediaRecorder = null;
        this.isStreaming = false;
        this.chunkInterval = 100;
        this.onConnectCallback = null;
        this.onDisconnectCallback = null;
        this.reconnectAttempts = 0;
        this.keepAliveInterval = null;
        this.lastKeepaliveTime = null;
        this.wsInitialized = false;
    }

    setCallbacks(callbacks) {
        this.onConnectCallback = callbacks?.onConnect;
        this.onDisconnectCallback = callbacks?.onDisconnect;
    }

    async initialize(videoElement) {
        try {
            // Initialize video first and wait for it to be ready
            await this.initializeVideo(videoElement);
            
            // Initialize WebSocket with retries
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    await this.initializeWebSocket();
                    return true;
                } catch (error) {
                    console.warn(`WebSocket connection attempt ${attempt + 1} failed:`, error);
                    if (attempt === 2) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        } catch (error) {
            console.error("Stream initialization failed:", error);
            this.cleanup();
            return false;
        }
    }

    async initializeVideo(videoElement) {
        this.videoElement = videoElement;
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                frameRate: { ideal: 10, max: 15 }
            },
            audio: false
        });

        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
    }

    async initializeWebSocket() {
        if (this.wsInitialized) return;

        // Use the WebSocket URL as is, without additional parameters
        const wsUrl = this.baseWsUrl;
        console.log('Connecting to WebSocket:', wsUrl);
        
        this.socket = new WebSocket(wsUrl);

        await this.setupWebSocketWithPromise();
        this.wsInitialized = true;
        this.startKeepAlive();
    }

    setupWebSocketWithPromise() {
        return new Promise((resolve, reject) => {
            let timeoutId = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
                this.cleanup();
            }, 10000);

            this.socket.onopen = () => {
                clearTimeout(timeoutId);
                console.log("WebSocket connection opened");
                this._wsReady = true;
                this._isConnected = true;
                this.onConnectCallback?.();
                this.startStreaming();
                resolve();
            };

            const handleMessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'init_success' || data.type === 'accepted') {
                        clearTimeout(timeoutId);
                        this._wsReady = true;
                        this._isConnected = true;
                        this.onConnectCallback?.();
                        this.startStreaming();
                        
                        // Cleanup listeners
                        this.socket.removeEventListener('open', handleOpen);
                        this.socket.removeEventListener('message', handleMessage);
                        this.socket.removeEventListener('error', handleError);
                        
                        resolve();
                    }
                } catch (error) {
                    console.debug('Non-JSON message received:', event.data);
                }
            };

            const handleError = (error) => {
                clearTimeout(timeoutId);
                reject(error);
                this.cleanup();
            };

            this.socket.addEventListener('message', handleMessage);
            this.socket.addEventListener('error', handleError);
        });
    }

    startKeepAlive() {
        this.keepAliveInterval = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'keepalive' }));
                this.lastKeepaliveTime = Date.now();
            }
        }, 15000);
    }

    reconnect() {
        if (this.reconnectAttempts >= 3) return;
        
        setTimeout(() => {
            console.log('Attempting to reconnect...');
            this.reconnectAttempts++;
            this.initialize(this.videoElement).catch(console.error);
        }, 1000 * Math.pow(2, this.reconnectAttempts));
    }

    async endSession() {
        try {
            // Stop streaming first
            this.stopStreaming();
            
            // Clean up video tracks
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            // Clean up video element
            if (this.videoElement) {
                this.videoElement.srcObject = null;
                this.videoElement = null;
            }

            // Close WebSocket with normal closure code
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.close(1000, 'Exam ended');
            }

            this._isConnected = false;
            this._wsReady = false;
            this.wsInitialized = false;

            return true;
        } catch (error) {
            console.error('End session error:', error);
            throw error;
        }
    }

    cleanup() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }

        // Ensure proper WebSocket closure
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.close(1000, 'Normal closure');
        }

        // Stop all tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        this.socket = null;
        this.stream = null;
        this.isStreaming = false;
        this.wsInitialized = false;
        this._isConnected = false;
        this._wsReady = false;
    }

    startStreaming() {
        if (!this.stream || !this.socket || this.isStreaming) return;
        this.isStreaming = true;
        this.captureFrames();
    }

    async captureFrames() {
        while (this.isStreaming && this.socket?.readyState === WebSocket.OPEN) {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = this.videoElement.videoWidth;
                canvas.height = this.videoElement.videoHeight;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(this.videoElement, 0, 0);

                const imageData = canvas.toDataURL('image/jpeg', 0.7);
                this.socket.send(imageData);

                await new Promise(resolve => setTimeout(resolve, this.chunkInterval));
            } catch (error) {
                console.error("Frame capture error:", error);
            }
        }
    }

    stopStreaming() {
        this.isStreaming = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
    }

    get isConnected() {
        return this.socket?.readyState === WebSocket.OPEN && this.isStreaming;
    }

    disconnect() {
        this.stopStreaming();
    }
}
