const BASE_URL = 'http://localhost:8080/api/v1/exam';

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

export const examService = {
    async startExam(userId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('Authentication required');

            const formData = new FormData();
            formData.append('userId', userId);

            const response = await fetch(`${BASE_URL}/start/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token.trim()}`
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || error.detail || 'Failed to start exam');
            }

            const data = await response.json();
            console.log('Exam session created:', data);

            return {
                status: data.status || 'ready',
                sessionId: userId,
                wsUrl: data.wsUrl,
                wsConfig: {
                    token: token.trim()
                }
            };
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

    async endExam(userId) {
        try {
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('userId', userId);

            const response = await retryFetch(`${BASE_URL}/end/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token.trim()}`
                },
                body: formData
            });
            return await response.json();
        } catch (error) {
            console.error('End exam error:', error);
            throw new Error('Failed to end exam. Please try again.');
        }
    }
};
