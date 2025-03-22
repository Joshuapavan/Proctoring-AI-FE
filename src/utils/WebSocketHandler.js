class WebSocketHandler {
    constructor(userId, onMessage) {
        this.userId = userId;
        this.onMessage = onMessage;
        this.ws = null;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.retryTimeout = null;
        this.isAccepted = false;
        this.maxAttempts = 5;
        this.currentAttempt = 0;
        this.backoffDelay = 1000;
        this.connectionCheckInterval = null;
        this.activeConnection = null;
        this.lastSuccessfulConnection = null;
        this.examSessionId = null;
        this.pingInterval = null;
        this.lastPingTime = null;
        this.lastConnectionParams = null;
    }

    validateAuth() {
        try {
            const token = this.getValidToken();
            if (!this.userId) {
                throw new Error('Missing user ID');
            }
            return token;
        } catch (error) {
            console.error('Auth validation failed:', error);
            throw new Error('Authentication required');
        }
    }

    getValidToken() {
        const token = localStorage.getItem('token');
        console.log('Getting token:', { hasToken: !!token });

        if (!token || token === 'undefined' || token === 'null') {
            localStorage.removeItem('token');
            throw new Error('No valid token found');
        }

        const trimmedToken = token.trim();
        if (!trimmedToken) {
            localStorage.removeItem('token');
            throw new Error('Invalid token format');
        }

        return trimmedToken;
    }

    async connect(examSessionId, wsUrl, wsConfig = {}) {
        try {
            if (!wsUrl) {
                throw new Error('Missing WebSocket URL');
            }

            if (this.isConnecting) {
                console.log('Connection already in progress');
                return;
            }

            this.isConnecting = true;
            this.examSessionId = examSessionId;

            const token = wsConfig.token || localStorage.getItem('token');
            if (!token) throw new Error('Authentication required');

            // Simple URL with only token
            const fullWsUrl = `${wsUrl}?token=${encodeURIComponent(token.trim())}`;
            
            console.log('Connecting to WebSocket:', {
                url: wsUrl,
                hasToken: !!token
            });

            return new Promise((resolve, reject) => {
                try {
                    this.ws = new WebSocket(fullWsUrl);
                    this.ws.binaryType = 'blob';
                    this.setupWebSocket(resolve, reject);
                } catch (error) {
                    this.cleanup();
                    reject(new Error('Connection failed: ' + error.message));
                }
            });
        } catch (error) {
            this.cleanup();
            throw error;
        }
    }

    setupWebSocket(resolve, reject) {
        const connectTimeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
            this.cleanup();
        }, 5000);

        this.ws.onopen = () => {
            clearTimeout(connectTimeout);
            console.log('WebSocket connection opened');
            this.isConnecting = false;
            this.startPingInterval();

            // Send initial message
            this.ws.send(JSON.stringify({
                type: 'init',
                userId: this.userId
            }));
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message:', data);

                if (data.type === 'keepalive' || data.type === 'init_success') {
                    this.isAccepted = true;
                    resolve(true);
                }

                this.onMessage?.(data);
            } catch (error) {
                console.error('Message handling error:', error);
            }
        };

        this.ws.onerror = (event) => {
            clearTimeout(timeout);
            const errorMessage = event.message || 'WebSocket connection failed';
            console.error('WebSocket error:', { 
                error: errorMessage,
                readyState: this.ws?.readyState,
                sessionId: this.examSessionId 
            });
            this.cleanup();
            reject(new Error(errorMessage));
        };

        this.ws.onclose = (event) => {
            clearTimeout(timeout);
            console.log('WebSocket closed:', {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
            });
            
            this.cleanup();

            if (event.code === 1000) {
                console.log('Normal closure');
            } else if (event.code === 1006) {
                console.error('Abnormal closure - attempting reconnect');
                this.handleReconnect();
            }
        };
    }

    startPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        this.pingInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
                this.lastPingTime = Date.now();
            }
        }, 30000); // Send ping every 30 seconds
    }

    handleClose(event) {
        console.log(`Connection closed for exam session ${this.examSessionId}:`, event.code);
        this.cleanup();

        if (event.code === 1000) {
            console.log('Normal closure');
            return;
        }

        if (event.code === 403) {
            console.log('Authentication failed');
            window.location.href = '/login';
            return;
        }
    }

    cleanup() {
        this.isConnecting = false;
        this.isAccepted = false;
        
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        if (this.ws) {
            try {
                this.ws.close();
            } catch (error) {
                console.error('Error closing WebSocket:', error);
            }
            this.ws = null;
        }
    }

    disconnect() {
        this.cleanup();
        this.examSessionId = null;
        this.lastPingTime = null;
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this.onMessage?.(data);
        } catch (error) {
            console.error('Message handling error:', error);
        }
    }

    handleReconnect() {
        if (this.currentAttempt >= this.maxAttempts) {
            console.log('Max reconnection attempts reached');
            return;
        }

        if (!this.lastConnectionParams) {
            console.error('No connection parameters available for reconnect');
            return;
        }

        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
        }

        this.cleanup();
        this.currentAttempt++;
        const delay = Math.min(1000 * Math.pow(2, this.currentAttempt - 1), 30000);
        
        console.log(`Scheduling reconnection attempt ${this.currentAttempt} in ${delay}ms`);
        
        this.retryTimeout = setTimeout(async () => {
            try {
                if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                    const { examSessionId, wsUrl, wsConfig } = this.lastConnectionParams;
                    await this.connect(examSessionId, wsUrl, wsConfig);
                }
            } catch (error) {
                console.error('Reconnection failed:', error);
                if (this.currentAttempt < this.maxAttempts) {
                    this.handleReconnect();
                }
            }
        }, delay);
    }

    sendFrame(imageBlob) {
        if (!this.isAccepted || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('Cannot send frame - connection not ready');
            return;
        }

        if (imageBlob instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'frame',
                        data: reader.result,
                        timestamp: Date.now()
                    }));
                }
            };
            reader.readAsDataURL(imageBlob);
        }
    }
}

export default WebSocketHandler;
