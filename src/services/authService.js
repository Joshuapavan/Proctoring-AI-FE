import { store } from '../store/store';
import { setCredentials, logout } from '../store/authSlice';

const API_URL = import.meta.env.VITE_API_URL;

export const authService = {
    async login(credentials) {
        const formData = new FormData();
        Object.keys(credentials).forEach(key => {
            formData.append(key, credentials[key]);
        });

        const response = await fetch(`${API_URL}/api/v1/auth/login`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        this.setAuth(data);
        return data;
    },

    async loginWithPassword(credentials) {
        try {
            const formData = new FormData();
            formData.append('email', credentials.email);
            formData.append('password', credentials.password);

            const response = await fetch(`${API_URL}/api/v1/auth/login/password`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Login failed');
            }
            
            this.setAuth(data);
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    },

    setAuth(data) {
        const token = data.token || data.access_token;
        const userId = data.id || data.userId;

        if (!token || !userId) {
            throw new Error('Invalid auth data');
        }

        // Clear any existing auth data
        localStorage.clear();
        
        // Set new auth data
        localStorage.setItem('token', token);
        localStorage.setItem('userId', userId);

        // Dispatch to Redux store
        store.dispatch(setCredentials({ token, userId }));

        return { token, userId };
    },

    getAuth() {
        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('userId');
        return { token, userId };
    },

    isAuthenticated() {
        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('userId');
        return Boolean(token && userId && token !== 'undefined' && token !== 'null');
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        store.dispatch(logout());
    }
};
