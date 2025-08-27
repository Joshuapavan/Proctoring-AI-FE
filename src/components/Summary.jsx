import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import Swal from 'sweetalert2';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { authService } from '../services/authService';
import { examService } from '../services/examService';

const Summary = () => {
    const summaryRef = useRef(null);
    const [summary, setSummary] = useState(null);
    const [userImage, setUserImage] = useState(null);
    const [score, setScore] = useState(0);
    const [loading, setLoading] = useState(true);
    const [examViolation, setExamViolation] = useState(null);
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

                const violationData = localStorage.getItem('examViolation');
                if (violationData) {
                    setExamViolation(JSON.parse(violationData));
                }

                setSummary({
                    overall_compliance: summaryData.overall_compliance || 0,
                    total_duration: summaryData.total_duration || 0,
                    face_detection_rate: summaryData.face_detection_rate || 0,
                    suspicious_activities: summaryData.suspicious_activities || {},
                    warnings: summaryData.warnings || [],
                    user: summaryData.user || {}
                });

                if (summaryData.user?.image) {
                    const img = new Image();
                    img.src = `data:image/jpeg;base64,${summaryData.user.image}`;
                    await new Promise((resolve) => {
                        img.onload = resolve;
                    });
                    setUserImage(img);
                }

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
            cutout: '65%',
            radius: '70%'
        };

        return (
            <div style={{ width: '300px', height: '300px', margin: '0 auto' }}>
                <Doughnut data={data} options={options} />
            </div>
        );
    };

    const renderViolations = () => {
        const violations = JSON.parse(localStorage.getItem('examViolations') || '{}');
        if (!Object.keys(violations).length) return null;

        return (
            <div className="section-card violations">
                <h3>Exam Violations</h3>
                <div className="violation-stats">
                    <div className="compliance-score">
                        <span>Compliance Score</span>
                        <strong>{violations.complianceScore}%</strong>
                    </div>
                    <div className="violation-list">
                        {violations.warnings.map((warning, index) => (
                            <div key={index} className="violation-item">
                                {warning}
                            </div>
                        ))}
                    </div>
                    {violations.type && (
                        <div className="termination-reason">
                            <span>Exam Terminated Due To:</span>
                            <strong>
                                {violations.type === 'tab-switch' ? 'Excessive Tab Switching' : 'Excessive Copy-Paste Attempts'}
                                ({violations.attempts} attempts)
                            </strong>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const handleLogout = async () => {
        try {
            const userId = localStorage.getItem('userId');
            if (userId) {
                await examService.clearLogs(userId);
            }

            authService.logout();
            navigate('/login', { replace: true });
        } catch (error) {
            console.warn('Logout error:', error);
            authService.logout();
            navigate('/login', { replace: true });
        }
    };

    const handleDownloadPDF = async () => {
        try {
            Swal.fire({
                title: 'Generating PDF',
                html: 'Please wait...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidth = pdf.internal.pageSize.width;
            let yPosition = 15;
            const lineHeight = 7;

            // Title and header info
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(20);
            pdf.setTextColor(0, 0, 0);
            pdf.text('Exam Report', pageWidth / 2, yPosition, { align: 'center' });
            
            yPosition += lineHeight * 2;
            pdf.setFontSize(12);
            pdf.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' });
            
            // User Info
            yPosition += lineHeight * 2;
            if (summary.user?.email) {
                pdf.text(`Candidate: ${summary.user.email}`, pageWidth / 2, yPosition, { align: 'center' });
            }

            // Add user image if available
            if (summary.user?.image) {
                yPosition += lineHeight * 2;
                const imgData = `data:image/jpeg;base64,${summary.user.image}`;
                const imgProps = pdf.getImageProperties(imgData);
                const imgWidth = 50;
                const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
                pdf.addImage(imgData, 'JPEG', (pageWidth - imgWidth) / 2, yPosition, imgWidth, imgHeight);
                yPosition += imgHeight + lineHeight;
            }

            // Score and Compliance
            yPosition += lineHeight * 2;
            pdf.setFontSize(14);
            pdf.text('Exam Performance', pageWidth / 2, yPosition, { align: 'center' });
            
            yPosition += lineHeight;
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Score: ${score}/5`, 20, yPosition);
            pdf.text(`Compliance Rate: ${summary.overall_compliance.toFixed(1)}%`, 20, yPosition + lineHeight);
            pdf.text(`Duration: ${summary.total_duration.toFixed(1)} minutes`, 20, yPosition + lineHeight * 2);
            pdf.text(`Face Detection Rate: ${summary.face_detection_rate.toFixed(1)}%`, 20, yPosition + lineHeight * 3);

            // Violations Section
            yPosition += lineHeight * 5;
            pdf.setFont('helvetica', 'bold');
            pdf.text('Major Violations', 20, yPosition);
            
            yPosition += lineHeight;
            pdf.setFont('helvetica', 'normal');
            if (Object.keys(summary.suspicious_activities).length > 0) {
                Object.entries(summary.suspicious_activities).forEach(([key, value]) => {
                    const violation = formatViolationDisplay(key, value);
                    yPosition += lineHeight;
                    const violationText = `${key.replace(/_/g, ' ')} - Count: ${violation.count}`;
                    pdf.text(violationText, 25, yPosition);
                    yPosition += lineHeight - 2;
                    pdf.setFontSize(10);
                    pdf.text(`First occurred at: ${violation.timestamp}`, 30, yPosition);
                    pdf.setFontSize(12);
                });
            } else {
                yPosition += lineHeight;
                pdf.text('No major violations detected', 25, yPosition);
            }

            // Add warnings if available
            if (summary.warnings?.length > 0) {
                yPosition += lineHeight * 2;
                pdf.setFont('helvetica', 'bold');
                pdf.text('Warnings', 20, yPosition);
                pdf.setFont('helvetica', 'normal');
                summary.warnings.forEach(warning => {
                    yPosition += lineHeight;
                    pdf.text(`• ${warning}`, 25, yPosition);
                });
            }

            // Footer
            pdf.setFontSize(10);
            pdf.setTextColor(128, 128, 128);
            const footer = 'AI Proctoring System - Exam Report';
            pdf.text(footer, pageWidth / 2, pdf.internal.pageSize.height - 10, { align: 'center' });

            // Save the PDF
            pdf.save(`exam_summary_${localStorage.getItem('userId')}.pdf`);

            await Swal.fire({
                icon: 'success',
                title: 'Download Complete',
                text: 'Your exam summary has been downloaded successfully.',
                background: '#2a2a2a',
                color: '#fff'
            });
        } catch (error) {
            console.error('PDF generation error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Download Failed',
                text: 'Failed to generate PDF. Please try again.',
                background: '#2a2a2a',
                color: '#fff'
            });
        }
    };

    const formatViolationDisplay = (key, value) => {
        return {
            count: value.count,
            timestamp: new Date(value.first_occurrence).toLocaleString()
        };
    };

    const renderUserInfo = () => {
        if (!summary?.user) return null;
        return (
            <div className="user-info-section">
                {/* {userImage && (
                    <div className="user-image">
                        <img 
                            src={`data:image/jpeg;base64,${summary.user.image}`}
                            alt="User"
                        />
                    </div>
                )} */}
                <div className="user-details">
                    <span className="user-email">{summary.user.email}</span>
                </div>
            </div>
        );
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
            <div ref={summaryRef}>
                {renderUserInfo()}
                <div className="summary-header">
                    <h1>Exam Results</h1>
                    <div className="header-stats">
                        <div className="stat-card primary">
                            <h3>Score</h3>
                            <div className="score-display">
                                <strong>{score}</strong>
                                <span>/5</span>
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
                                {examViolation && examViolation.type === 'copy-paste' && (
                                    <div className="metric-item violation">
                                        <span>Violation</span>
                                        <strong>Copy-Paste Detected</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {summary.suspicious_activities && Object.keys(summary.suspicious_activities).length > 0 && (
                        <div className="activity-section">
                            <div className="section-card">
                                <h3>Major Violations</h3>
                                <div className="activity-list">
                                    {Object.entries(summary.suspicious_activities).map(([key, value]) => {
                                        const violation = formatViolationDisplay(key, value);
                                        return (
                                            <div key={key} className="activity-item high-severity">
                                                <div className="activity-details">
                                                    <span className="activity-name">
                                                        {key.replace(/_/g, ' ')}
                                                    </span>
                                                    <div className="activity-info">
                                                        <strong className="activity-count">
                                                            count: {violation.count} 
                                                        </strong>
                                                        <span className="violation-timestamp">
                                                            at {violation.timestamp}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {renderViolations()}

                    <div className="actions-section">
                        <button onClick={handleLogout} className="action-button primary">
                            Complete Exam & Logout
                        </button>
                        <button onClick={handleDownloadPDF} className="action-button secondary">
                            Download Summary
                        </button>
                        <button onClick={() => navigate('/exam')} className="action-button secondary">
                            Back to Exam
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Summary;

