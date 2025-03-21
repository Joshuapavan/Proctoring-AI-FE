import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  Title
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  Title
);

const javaQuestions = [
  {
    id: 1,
    question: "What is the output of System.out.println(1 + 2 + \"3\")?",
    options: ["123", "33", "6", "Error"],
    correct: "33"
  },
  {
    id: 2,
    question: "Which of these is not a Java keyword?",
    options: ["static", "Boolean", "void", "private"],
    correct: "Boolean"
  },
  {
    id: 3,
    question: "What is the default value of int variable?",
    options: ["0", "null", "undefined", "1"],
    correct: "0"
  }
];

const Dashboard = () => {
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [summary, setSummary] = useState(null);
  const [examId, setExamId] = useState(localStorage.getItem('userId') || '1');
  const [timeRemaining, setTimeRemaining] = useState(45 * 60); // 45 minutes in seconds
  const timerRef = useRef(null);

  useEffect(() => {
    const userId = localStorage.getItem('userId') || '1'; // Get actual user ID
    const token = localStorage.getItem('token');

    if (!token) {
      navigate('/login');
      return;
    }

    // Initialize WebSocket
    wsRef.current = new WebSocket(`ws://localhost:8080/ws/${userId}`);

    wsRef.current.onopen = () => {
      console.log('WebSocket Connected');
      setConnected(true);
      startVideo();
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket Disconnected');
      setConnected(false);
      // Redirect to home if connection is lost during exam
      if (!showScore) {
        Swal.fire({
          icon: 'error',
          title: 'Connection Lost',
          text: 'Your exam session has ended due to connection loss.',
          background: '#2a2a2a',
          color: '#fff',
          confirmButtonColor: '#646cff'
        }).then(() => {
          navigate('/');
        });
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket Error:', error);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [navigate, showScore]);

  useEffect(() => {
    if (!showScore && connected) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 0) {
            clearInterval(timerRef.current);
            handleFinishExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [connected, showScore]);

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 }
      });
      videoRef.current.srcObject = stream;

      // Start sending frames
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      setInterval(() => {
        if (videoRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => {
            wsRef.current.send(blob);
          }, 'image/jpeg', 0.7);
        }
      }, 1000); // Send frame every second
    } catch (err) {
      console.error('Error accessing webcam:', err);
    }
  };

  const fetchSummary = async () => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        throw new Error('User ID not found');
      }

      // First cleanup all connections
      if (wsRef.current) {
        wsRef.current.close();
        setConnected(false);
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }

      // Then fetch summary with correct user ID
      const response = await fetch(`http://localhost:8080/api/v1/exam/summary/${userId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to fetch summary');
      }
      setSummary(data);
    } catch (err) {
      console.error('Error fetching summary:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Failed to fetch exam summary',
        background: '#2a2a2a',
        color: '#fff',
        confirmButtonColor: '#646cff'
      });
    }
  };

  const renderSummaryChart = () => {
    if (!summary) return null;

    const data = {
      labels: ['Compliant', 'Non-Compliant'],
      datasets: [{
        data: [summary.overall_compliance, (100 - summary.overall_compliance)],
        backgroundColor: ['#2ecc71', '#e74c3c'],
        borderColor: ['#27ae60', '#c0392b'],
        borderWidth: 1,
      }]
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#fff',
            padding: 20,
            font: {
              size: 14
            }
          }
        }
      },
      animation: {
        animateScale: true,
        animateRotate: true
      }
    };

    return (
      <div className="summary-chart">
        <Doughnut data={data} options={options} />
      </div>
    );
  };

  const handleAnswer = async (answer) => {
    if (answer === javaQuestions[currentQuestion].correct) {
      setScore(score + 1);
    }

    const nextQuestion = currentQuestion + 1;
    if (nextQuestion < javaQuestions.length) {
      setCurrentQuestion(nextQuestion);
    } else {
      setShowScore(true);
      await fetchSummary();
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleFinishExam = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    Swal.fire({
      title: timeRemaining <= 0 ? 'Time\'s Up!' : 'Finish Exam?',
      text: timeRemaining <= 0 
        ? 'Your time has expired. The exam will be submitted now.'
        : 'Are you sure you want to finish the exam? This action cannot be undone.',
      icon: timeRemaining <= 0 ? 'info' : 'warning',
      background: '#2a2a2a',
      color: '#fff',
      showCancelButton: timeRemaining > 0,
      confirmButtonColor: '#646cff',
      cancelButtonColor: '#e74c3c',
      confirmButtonText: 'Submit Exam',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed || timeRemaining <= 0) {
        setShowScore(true);
        fetchSummary();
      }
    });
  };

  // Add cleanup on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="dashboard-layout">
      <aside className="proctor-sidebar">
        <div className="video-monitor">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="webcam-feed"
          />
          <div className={`status-indicator ${connected ? 'active' : ''}`}>
            <span className="status-dot"></span>
            {connected ? "Monitoring Active" : "Connecting..."}
          </div>
        </div>
        <div className="exam-info">
          <h3>Java Programming</h3>
          <div className="exam-stats">
            <div className="stat">
              <span>Questions</span>
              <strong>{javaQuestions.length}</strong>
            </div>
            <div className="stat">
              <span>Progress</span>
              <strong>{currentQuestion + 1}/{javaQuestions.length}</strong>
            </div>
          </div>
        </div>
      </aside>

      <main className="exam-content">
        {!connected ? (
          <div className="connection-warning">
            <div className="warning-card">
              <div className="loading-spinner"></div>
              <h2>Establishing Secure Connection</h2>
              <p>Please ensure your camera is enabled and wait while we connect you to the exam session...</p>
            </div>
          </div>
        ) : showScore ? (
          <div className="results-container">
            <div className="score-card">
              <h2>Exam Complete!</h2>
              <div className="final-score">
                <div className="score-circle">
                  <strong>{score}</strong>
                  <span>/{javaQuestions.length}</span>
                </div>
                <p>Questions Correct</p>
              </div>
              
              {summary && (
                <div className="summary-dashboard">
                  <div className="summary-chart-container">
                    <h3>Proctoring Results</h3>
                    {renderSummaryChart()}
                  </div>
                  
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <span>Duration</span>
                      <strong>{summary.total_duration.toFixed(1)} min</strong>
                    </div>
                    <div className="metric-card">
                      <span>Face Detection</span>
                      <strong>{summary.face_detection_rate.toFixed(1)}%</strong>
                    </div>
                  </div>

                  <div className="activity-log">
                    <h4>Suspicious Activity Log</h4>
                    <div className="activity-list">
                      {Object.entries(summary.suspicious_activities).map(([key, value]) => (
                        <div key={key} className="activity-item">
                          <span>{key.replace(/_/g, ' ')}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="completion-actions">
                    <p>Thank you for completing the exam!</p>
                    <button onClick={() => navigate('/')} className="exit-btn">
                      Return to Dashboard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="question-card">
            <div className="question-header">
              <span className="question-number">Question {currentQuestion + 1}</span>
              <div className={`timer-display ${timeRemaining <= 300 ? 'timer-warning' : ''}`}>
                Time Remaining: {formatTime(timeRemaining)}
              </div>
              <button 
                onClick={handleFinishExam}
                className="finish-exam-btn"
              >
                Finish Exam
              </button>
            </div>
            
            <div className="question-content">
              <h3>{javaQuestions[currentQuestion].question}</h3>
              <div className="options-grid">
                {javaQuestions[currentQuestion].options.map((option) => (
                  <button
                    key={option}
                    onClick={() => handleAnswer(option)}
                    className="option-button"
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
