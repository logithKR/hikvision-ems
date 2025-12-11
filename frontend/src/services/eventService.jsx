// Server-Sent Events (SSE) service for live updates

class EventService {
  constructor() {
    this.eventSource = null;
    this.listeners = {};
  }

  connect(baseURL = 'http://localhost:8080') {
    if (this.eventSource) {
      console.log('Already connected to event stream');
      return;
    }

    this.eventSource = new EventSource(`${baseURL}/api/events/stream`);

    this.eventSource.onopen = () => {
      console.log('✅ Connected to live event stream');
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📡 Event received:', data.type);
        
        // Notify all listeners for this event type
        if (this.listeners[data.type]) {
          this.listeners[data.type].forEach(callback => callback(data.data));
        }

        // Notify wildcard listeners
        if (this.listeners['*']) {
          this.listeners['*'].forEach(callback => callback(data));
        }
      } catch (error) {
        console.error('Error parsing event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('❌ EventSource error:', error);
      this.reconnect(baseURL);
    };
  }

  reconnect(baseURL) {
    console.log('🔄 Reconnecting in 3 seconds...');
    setTimeout(() => {
      this.disconnect();
      this.connect(baseURL);
    }, 3000);
  }

  on(eventType, callback) {
    if (!this.listeners[eventType]) {
      this.listeners[eventType] = [];
    }
    this.listeners[eventType].push(callback);
  }

  off(eventType, callback) {
    if (this.listeners[eventType]) {
      this.listeners[eventType] = this.listeners[eventType].filter(cb => cb !== callback);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('🔌 Disconnected from event stream');
    }
  }
}

// Singleton instance
export const eventService = new EventService();
