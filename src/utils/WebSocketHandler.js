class WebSocketHandler {
    constructor(userId, onMessage) {
        this.userId = userId;
        this.onMessage = onMessage;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        this.isConnecting = false;
    }

    connect() {
        if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) return;

        this.isConnecting = true;
        this.ws = new WebSocket(`ws://localhost:8080/ws/${this.userId}`);

        this.ws.onopen = () => {
            console.log('WebSocket Connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                switch(data.type) {
                    case 'keepalive':
                        this.ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                    case 'ping':
                        this.ws.send(JSON.stringify({ type: 'pong' }));
                        break;
                    case 'logs':
                        this.onMessage(data.data);
                        break;
                    default:
                        console.log('Unknown message type:', data.type);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        };

        this.ws.onclose = () => {
            this.isConnecting = false;
            this.handleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.ws.close();
        };
    }

    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }

        const timeout = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`Reconnecting in ${timeout/1000} seconds...`);

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, timeout);
    }

    sendFrame(imageData) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(imageData);
        }
    }

    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        if (this.ws) {
            this.ws.close();
        }
    }
}

export default WebSocketHandler;
