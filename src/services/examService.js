const API_URL = import.meta.env.VITE_API_URL;
const BASE_URL = `${API_URL}/api/v1/exam`;
const WS_URL = import.meta.env.VITE_WS_URL;

const retryFetch = async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            
            const error = await response.json().catch(() => ({}));
            if (response.status === 500) {
                console.log(`Attempt ${i + 1}: Retrying due to server error...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                continue;
            }
            throw new Error(error.message || `HTTP error! status: ${response.status}`);
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
};

const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('Authentication required');
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.trim()}`
    };
};

const sendRequest = async (url, options) => {
    const defaultOptions = {
        headers: getAuthHeaders(),
        mode: 'cors'
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Request failed: ${response.status}`);
    }

    return response.json().catch(() => ({}));
};

export const examService = {
    async getSession(userId) {
        try {
            const response = await fetch(`${BASE_URL}/session/${userId}`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to get session');
            return await response.json();
        } catch (error) {
            console.error('Get session error:', error);
            throw error;
        }
    },

    async startExam(userId) {
        try {
            const response = await fetch(`${BASE_URL}/start/${userId}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Failed to start exam');
            }

            // Simplify WebSocket URL construction
            if (data.wsUrl) {
                const token = localStorage.getItem('token');
                data.wsUrl = `${WS_URL}/ws/${userId}?token=${token}`;
            }

            return data;
        } catch (error) {
            console.error('Start exam error:', error);
            throw error;
        }
    },

    async pauseExam(userId) {
        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('userId', userId);

            const response = await retryFetch(`${BASE_URL}/pause/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token.trim()}`
                },
                body: formData
            });
            return await response.json();
        } catch (error) {
            console.error('Pause exam error:', error);
            throw new Error('Failed to pause exam. Please try again.');
        }
    },

    async resumeExam(userId) {
        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('userId', userId);

            const response = await retryFetch(`${BASE_URL}/resume/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token.trim()}`
                },
                body: formData
            });
            return await response.json();
        } catch (error) {
            console.error('Resume exam error:', error);
            throw new Error('Failed to resume exam. Please try again.');
        }
    },

    async stopExam(userId) {
        try {
            // Send stop request to server
            const response = await sendRequest(`${BASE_URL}/stop/${userId}`, {
                method: 'POST'
            });
            return response;
        } catch (error) {
            console.error('Stop exam error:', error);
            throw error;
        }
    },

    // Remove endExam method since we're not using it anymore

    async endExamAndLogout(userId) {
        try {
            await this.stopExam(userId);
            authService.logout();
            return { success: true, message: 'Exam ended and logged out successfully' };
        } catch (error) {
            console.error('End exam and logout error:', error);
            throw error;
        }
    },

    async getExamSummary(userId) {
        try {
            const response = await sendRequest(`${BASE_URL}/summary/${userId}`);
            return response;
        } catch (error) {
            console.error('Get summary error:', error);
            throw error;
        }
    },

    async clearLogs(userId) {
        try {
            const response = await fetch(`${BASE_URL}/clear-logs/${userId}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });

            if (!response.ok) {
                throw new Error('Failed to clear logs');
            }

            return true;
        } catch (error) {
            console.warn('Clear logs error:', error);
            // Don't throw error since this is cleanup
            return false;
        }
    }
};
