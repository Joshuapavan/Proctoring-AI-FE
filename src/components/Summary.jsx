import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import Swal from 'sweetalert2';
import { authService } from '../services/authService';
import { examService } from '../services/examService';

const Summary = () => {
    const [summary, setSummary] = useState(null);
    const [score, setScore] = useState(0);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const examScore = localStorage.getItem('examScore');
                const userId = localStorage.getItem('userId');

                if (!examScore || !userId) {
                    throw new Error('Missing exam data');
                }

                setScore(parseInt(examScore) || 0);
                const summaryData = await examService.getExamSummary(userId);
                
                setSummary({
                    overall_compliance: summaryData.overall_compliance || 0,
                    total_duration: summaryData.total_duration || 0,
                    face_detection_rate: summaryData.face_detection_rate || 0,
                    suspicious_activities: summaryData.suspicious_activities || {},
                    warnings: summaryData.warnings || []
                });
            } catch (error) {
                console.error('Error loading summary:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to load exam summary',
                    background: '#2a2a2a',
                    color: '#fff'
                });
                navigate('/exam');
            } finally {
                setLoading(false);
            }
        };

        fetchSummary();
    }, [navigate]);

    const renderSummaryChart = () => {
        if (!summary) return null;

        const data = {
            labels: ['Compliant', 'Non-Compliant'],
            datasets: [{
                data: [
                    summary.overall_compliance || 0,
                    100 - (summary.overall_compliance || 0)
                ],
                backgroundColor: ['#2ecc71', '#e74c3c'],
                borderColor: ['#27ae60', '#c0392b'],
                borderWidth: 1,
            }]
        };

        const options = {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#fff',
                        padding: 20,
                        font: { size: 14 }
                    }
                }
            },
            cutout: '65%',  // Make donut thinner
            radius: '70%'   // Make overall chart smaller
        };

        // Wrap chart in container with controlled dimensions
        return (
            <div style={{ width: '300px', height: '300px', margin: '0 auto' }}>
                <Doughnut data={data} options={options} />
            </div>
        );
    };

    const handleLogout = async () => {
        try {
            // Clear logs first
            const userId = localStorage.getItem('userId');
            if (userId) {
                await examService.clearLogs(userId);
            }

            // Then proceed with logout
            authService.logout();
            navigate('/login', { replace: true });
        } catch (error) {
            console.warn('Logout error:', error);
            // Still proceed with logout even if clearing logs fails
            authService.logout();
            navigate('/login', { replace: true });
        }
    };

    if (loading) {
        return (
            <div className="summary-loading">
                <div className="loading-spinner"></div>
                <h3>Loading Exam Results...</h3>
            </div>
        );
    }

    if (!summary) return null;

    return (
        <div className="summary-container">
            <div className="summary-header">
                <h1>Exam Results</h1>
                <div className="header-stats">
                    <div className="stat-card primary">
                        <h3>Score</h3>
                        <div className="score-display">
                            <strong>{score}</strong>
                            <span>/3</span>
                        </div>
                        <p>Questions Correct</p>
                    </div>
                    <div className="stat-card secondary">
                        <h3>Compliance Rate</h3>
                        <div className="score-display">
                            <strong>{summary.overall_compliance.toFixed(1)}%</strong>
                        </div>
                        <p>Overall Performance</p>
                    </div>
                </div>
            </div>

            <div className="summary-grid">
                <div className="chart-section">
                    <div className="section-card">
                        <h3>Proctoring Analysis</h3>
                        {renderSummaryChart()}
                    </div>
                </div>

                <div className="metrics-section">
                    <div className="section-card">
                        <h3>Exam Metrics</h3>
                        <div className="metrics-grid">
                            <div className="metric-item">
                                <span>Duration</span>
                                <strong>{(summary.total_duration || 0).toFixed(1)} min</strong>
                            </div>
                            <div className="metric-item">
                                <span>Face Detection</span>
                                <strong>{(summary.face_detection_rate || 0).toFixed(1)}%</strong>
                            </div>
                            <div className="metric-item">
                                <span>Warnings</span>
                                <strong>{summary.warnings?.length || 0}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                {summary.suspicious_activities && (
                    <div className="activity-section">
                        <div className="section-card">
                            <h3>Suspicious Activity Log</h3>
                            <div className="activity-list">
                                {Object.entries(summary.suspicious_activities).map(([key, value]) => (
                                    <div key={key} className="activity-item">
                                        <div className="activity-icon">⚠️</div>
                                        <div className="activity-details">
                                            <span className="activity-name">{key.replace(/_/g, ' ')}</span>
                                            <strong className="activity-count">{value}</strong>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div className="actions-section">
                    <button onClick={handleLogout} className="action-button primary">
                        Complete Exam & Logout
                    </button>
                    <button onClick={() => navigate('/exam')} className="action-button secondary">
                        Back to Exam
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Summary;
