import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import Swal from 'sweetalert2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  Title
} from 'chart.js';
import WebSocketHandler from '../utils/WebSocketHandler';
import { examService } from '../services/examService';
import { authService } from '../services/authService';

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
  const [isPaused, setIsPaused] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const lastTimeRef = useRef(null);
  const wsHandlerRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const [examStarted, setExamStarted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Mount effect - Only run once on component mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    
    // Reset states before initialization
    setConnected(false);
    setIsReady(false);
    setExamStarted(false);
    setIsInitializing(true);

    initializeExam();

    return () => cleanup(false); // Cleanup without navigation on unmount
  }, []);

  const handleApiError = async (error, action) => {
    console.error(`Error during ${action}:`, error);
    const result = await Swal.fire({
        icon: 'error',
        title: 'Connection Error',
        text: `Failed to ${action}. Would you like to retry?`,
        background: '#2a2a2a',
        color: '#fff',
        showCancelButton: true,
        confirmButtonColor: '#646cff',
        cancelButtonColor: '#e74c3c',
        confirmButtonText: 'Retry',
        cancelButtonText: 'Cancel'
    });

    return result.isConfirmed;
  };

  const initializeExam = async () => {
    try {
        const { token, userId } = authService.getAuth();
        if (!token || !userId) {
            throw new Error('Authentication required');
        }

        // Start exam session
        const examResponse = await examService.startExam(userId);
        console.log('Exam session started:', examResponse);

        // Initialize components one by one
        await startVideo();
        await new Promise(resolve => setTimeout(resolve, 500)); // Give camera time to initialize

        // Initialize WebSocket
        wsHandlerRef.current = new WebSocketHandler(userId, handleWebSocketMessage);
        
        // Connect WebSocket
        await wsHandlerRef.current.connect(
            examResponse.sessionId,
            examResponse.wsUrl,
            examResponse.wsConfig
        );

        // Update states in sequence
        setExamId(userId);
        setConnected(true);
        setIsReady(true);
        setExamStarted(true);
        setIsInitializing(false);
        
        console.log('Initialization complete');

    } catch (error) {
        console.error('Initialization failed:', error);
        cleanup(false);
        
        if (error.message.includes('auth')) {
            navigate('/login', { replace: true });
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Connection Error',
                text: error.message,
                background: '#2a2a2a',
                color: '#fff'
            });
        }
    }
  };

  const handleWebSocketMessage = (data) => {
    console.log('WebSocket message:', data);
    if (data.type === 'keepalive') {
        // Update all states at once to trigger render
        Promise.all([
            setConnected(true),
            setIsReady(true),
            setExamStarted(true),
            setIsInitializing(false)
        ]);
    }
  };

  const startSendingFrames = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    frameIntervalRef.current = setInterval(() => {
      if (videoRef.current && wsHandlerRef.current?.isAccepted) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (blob && wsHandlerRef.current) {
              wsHandlerRef.current.sendFrame(blob);
            }
          },
          'image/jpeg',
          0.7
        );
      }
    }, 1000);
  };

  // Update state sync effect
  useEffect(() => {
    const updateState = () => {
        if (wsHandlerRef.current?.isAccepted && !isInitializing) {
            setConnected(true);
            setIsReady(true);
            setExamStarted(true);
        }
    };
    updateState();
}, [wsHandlerRef.current?.isAccepted, isInitializing]);

useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!showScore && connected && !isPaused) {
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
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [connected, showScore, isPaused]);

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: 640, 
          height: 480,
          frameRate: { ideal: 10 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Create canvas once
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');

      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }

      frameIntervalRef.current = setInterval(() => {
        if (videoRef.current && wsHandlerRef.current?.isAccepted && !isPaused) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                wsHandlerRef.current.sendFrame(blob);
              }
            },
            'image/jpeg',
            0.7
          );
        }
      }, 1000);

    } catch (err) {
      console.error('Error accessing webcam:', err);
      Swal.fire({
        icon: 'error',
        title: 'Camera Error',
        text: 'Unable to access webcam. Please ensure camera permissions are granted.',
        background: '#2a2a2a',
        color: '#fff',
        confirmButtonColor: '#646cff'
      });
    }
  };

  const endExamSession = async (userId) => {
    try {
      await examService.endExam(userId);
      setExamStarted(false);
      return true;
    } catch (error) {
      console.error('Error ending exam session:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    navigate('/login');
  };

  const cleanup = (shouldNavigate = true) => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    if (wsHandlerRef.current) {
      wsHandlerRef.current.disconnect();
    }
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setConnected(false);
    setIsReady(false);
    setExamStarted(false);

    if (shouldNavigate) {
        authService.logout();
        navigate('/login', { replace: true });
    }
  };

  const fetchSummary = async () => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        throw new Error('User ID not found');
      }

      // First end the exam session
      await endExamSession(userId);
      
      // Then cleanup resources
      cleanup();

      // Finally fetch the summary
      const response = await fetch(`http://localhost:8080/api/v1/exam/summary/${userId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to fetch summary');
      }
      setSummary(data);
    } catch (err) {
      console.error('Error in exam completion:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: err.message || 'Failed to complete exam',
        background: '#2a2a2a',
        color: '#fff',
        confirmButtonColor: '#646cff'
      });
    }
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

  const handleFinishExam = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const result = await Swal.fire({
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
    });

    if (result.isConfirmed || timeRemaining <= 0) {
      try {
        setShowScore(true);
        await fetchSummary(); // This will also handle cleanup
      } catch (error) {
        console.error('Error finishing exam:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'Failed to submit exam. Please try again.',
          background: '#2a2a2a',
          color: '#fff',
          confirmButtonColor: '#646cff'
        });
      }
    }
  };

  // Add cleanup on component unmount
  useEffect(() => {
    return cleanup;
  }, []);

  // Add exam pause/resume handler for page visibility
  useEffect(() => {
    const handleVisibilityChange = async () => {
      const userId = localStorage.getItem('userId');
      if (!userId || !examStarted || !connected) return;

      if (document.hidden) {
        try {
          await examService.pauseExam(userId);
          setIsPaused(true);
        } catch (error) {
          console.error('Failed to pause exam:', error);
        }
      } else {
        try {
          await examService.resumeExam(userId);
          setIsPaused(false);
        } catch (error) {
          console.error('Failed to resume exam:', error);
        }
      }
    };

    // Only add visibility listener after exam has started
    if (examStarted && connected) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [examStarted, connected]);

  // Handle page refresh
  useEffect(() => {
    const handleBeforeUnload = async (event) => {
      if (examStarted) {
        const userId = localStorage.getItem('userId');
        if (userId) {
          await examService.pauseExam(userId);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [examStarted]);

  const handleLogout = () => {
    cleanup();
    authService.logout();
    navigate('/login');
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

  const renderContent = () => {
    if (isInitializing) {
        return (
            <div className="loading-overlay">
                <div className="loading-spinner"></div>
                <h2>Initializing Exam Session...</h2>
            </div>
        );
    }

    return (
        <>
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
                    <button 
                        onClick={handleLogout}
                        className="logout-btn"
                    >
                        Logout
                    </button>
                </div>
            </aside>

            <main className="exam-content">
                {connected && !showScore && (
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

                {!connected && (
                    <div className="connection-warning">
                        <div className="warning-card">
                            <div className="loading-spinner"></div>
                            <h2>Establishing Connection</h2>
                            <p>Please ensure your camera is enabled and wait while we connect you to the exam session...</p>
                        </div>
                    </div>
                )}

                {showScore && (
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
                )}
            </main>
        </>
    );
};

  return (
    <div className="dashboard-layout">
      {renderContent()}
    </div>
  );
};

export default Dashboard;
