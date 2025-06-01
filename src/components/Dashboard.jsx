import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import 'sweetalert2/dist/sweetalert2.css';
import { examService } from '../services/examService';
import { VideoStreamManager } from '../utils/WebSocketHandler';  // Update this line
import { authService } from '../services/authService';
import { formatTime } from '../utils/timeUtils';
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
  const wsHandlerRef = useRef(null);  // Add this line
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [summary, setSummary] = useState(null);
  const [examId, setExamId] = useState(localStorage.getItem('userId') || '1');
  const [timeRemaining, setTimeRemaining] = useState(45 * 60); // 45 minutes in seconds
  const timerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [examStarted, setExamStarted] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const frameIntervalRef = useRef(null);
  const [videoInitError, setVideoInitError] = useState(null);

  const initializeVideo = async (retryCount = 0, maxRetries = 3) => {
    return new Promise(async (resolve) => {
      try {
        // First check if video element exists
        if (!videoRef.current) {
          setVideoInitError('Video element not found');
          resolve(false);
          return;
        }

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices?.getUserMedia) {
          setVideoInitError('Camera access not supported in your browser');
          resolve(false);
          return;
        }

        // Try to get camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 10, max: 15 },
            facingMode: "user"
          }
        });

        // Check if stream is valid
        if (!stream.active) {
          throw new Error('Camera stream not active');
        }

        // Set up video element
        videoRef.current.srcObject = stream;
        await new Promise((resolveVideo) => {
          videoRef.current.onloadedmetadata = () => resolveVideo();
          videoRef.current.onerror = () => {
            setVideoInitError('Failed to load video stream');
            resolveVideo();
          };
        });

        // Try to play the video
        try {
          await videoRef.current.play();
          console.log('Video stream initialized successfully');
          resolve(true);
        } catch (playError) {
          console.error('Video play error:', playError);
          throw new Error('Failed to start video playback');
        }

      } catch (err) {
        console.error('Video initialization error:', err);
        
        if (retryCount < maxRetries) {
          console.log(`Retrying video initialization (${retryCount + 1}/${maxRetries})...`);
          setTimeout(() => {
            resolve(initializeVideo(retryCount + 1, maxRetries));
          }, 1000);
        } else {
          setVideoInitError(
            err.name === 'NotAllowedError' 
              ? 'Camera access denied. Please check your permissions.'
              : err.name === 'NotFoundError'
              ? 'No camera found. Please connect a camera and try again.'
              : 'Failed to initialize camera. Please try again.'
          );
          resolve(false);
        }
      }
    });
  };

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token');
    let isComponentMounted = true;

    if (!token) {
      navigate('/login');
      return;
    }

    const initializeSession = async () => {
      try {
        setIsInitializing(true);
        setVideoInitError(null);

        // Initialize video first
        const videoReady = await initializeVideo();
        if (!videoReady || !isComponentMounted) {
          throw new Error('Video initialization failed');
        }
        setIsVideoReady(true);

        // Get exam session
        const examResponse = await examService.startExam(userId);
        if (!isComponentMounted) return;

        console.log('Exam session response:', examResponse);

        // Validate WebSocket URL
        if (!examResponse.wsUrl) {
          throw new Error('Invalid WebSocket URL received from server');
        }

        // Initialize VideoStreamManager with validated URL
        wsHandlerRef.current = new VideoStreamManager(
          examResponse.wsUrl,
          token,
          userId
        );

        wsHandlerRef.current.setCallbacks({
          onConnect: () => {
            if (isComponentMounted) {
              console.log('WebSocket connected successfully');
              setConnected(true);
            }
          },
          onDisconnect: () => {
            if (isComponentMounted) {
              console.log('WebSocket disconnected');
              setConnected(false);
            }
          }
        });

        // Initialize stream with existing video element
        const success = await wsHandlerRef.current.initialize(videoRef.current);
        if (!success) {
          throw new Error('Failed to initialize stream');
        }

        setIsInitializing(false);

      } catch (error) {
        console.error('Session initialization error:', error);
        if (isComponentMounted) {
          setVideoInitError(error.message);
          Swal.fire({
            icon: 'error',
            title: 'Connection Error',
            text: error.message,
            background: '#ffffff',
            color: '#1e293b',
          });
        }
      }
    };

    initializeSession();

    return () => {
      isComponentMounted = false;
      if (wsHandlerRef.current) {
        wsHandlerRef.current.stopStreaming();
        wsHandlerRef.current = null;
      }
    };
  }, [navigate]);

  const handleWebSocketMessage = (data) => {
    console.log('WebSocket message received:', data);
    if (data.type === 'keepalive') {
      setConnected(true);
    } else if (data.type === 'frame_processed') {
      console.debug('Frame processed:', data);
    } else if (data.type === 'frame_error') {
      console.error('Frame processing error:', data.error);
    }
  };

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

  const cleanup = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    if (wsHandlerRef.current) {
      wsHandlerRef.current.disconnect();
      wsHandlerRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
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
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/exam/summary/${userId}`);
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
        background: '#ffffff',
        color: '#1e293b',
        confirmButtonColor: '#3b82f6'
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

  const logout = () => {
    authService.logout();
    navigate('/login', { replace: true });
  }

  const handleAnswer = async (answer) => {
    if (answer === javaQuestions[currentQuestion].correct) {
        setScore(score + 1);
    }

    const nextQuestion = currentQuestion + 1;
    if (nextQuestion < javaQuestions.length) {
        setCurrentQuestion(nextQuestion);
    } else {
        // Clean up media streams first
        if (videoRef.current?.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => {
                track.stop();
            });
            videoRef.current.srcObject = null;
        }
        
        // Show loading screen
        Swal.fire({
            title: 'Completing Exam',
            html: 'Please wait while we process your results...',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            willOpen: () => {
                Swal.showLoading();
            },
            background: '#ffffff',
            color: '#1e293b',
        });

        try {
            // Close websocket
            if (wsHandlerRef.current) {
                await wsHandlerRef.current.endSession();
            }

            // Stop exam and get final score
            const userId = localStorage.getItem('userId');
            const response = await examService.stopExam(userId);
            
            // Store score and summary data
            localStorage.setItem('examScore', score + (answer === javaQuestions[currentQuestion].correct ? 1 : 0));
            localStorage.setItem('examSummary', JSON.stringify(response));

            // Close loading screen
            await Swal.close();
            
            // Navigate to summary page
            navigate('/summary');
        } catch (error) {
            console.error('Error ending exam:', error);
            await Swal.fire({
                icon: 'warning',
                title: 'Warning',
                text: 'Some cleanup operations failed, but your exam has been recorded.',
                background: '#ffffff',
                color: '#1e293b'
          });
            navigate('/summary');
        }
    }
};

const handleFinishExam = async () => {
    if (timerRef.current) {
        clearInterval(timerRef.current);
    }

    // Clean up media streams first
    if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => {
            track.stop();
        });
        videoRef.current.srcObject = null;
    }

    // Show loading screen
    Swal.fire({
        title: 'Completing Exam',
        html: 'Please wait while we process your results...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        willOpen: () => {
            Swal.showLoading();
        },
          background: '#ffffff',
          color: '#1e293b'
    });

    try {
        // Close websocket
        if (wsHandlerRef.current) {
            await wsHandlerRef.current.endSession();
        }

        // Stop exam and navigate to summary
        const userId = localStorage.getItem('userId');
        const response = await examService.stopExam(userId);

        // Store data
        localStorage.setItem('examScore', score);
        localStorage.setItem('examSummary', JSON.stringify(response));

        // Close loading screen
        await Swal.close();

        // Navigate to summary
        navigate('/summary');
    } catch (error) {
        console.error('Error ending exam:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to end exam properly. The exam will still be marked as complete.',
            background: '#ffffff',
  color: '#1e293b',
        });
        navigate('/summary');
    }
};

  const handleLogout = () => {
    Swal.fire({
      title: 'Logout',
      text: 'Are you sure you want to end your session?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#e74c3c',
      confirmButtonText: 'Yes, logout',
      background: '#ffffff',
      color: '#1e293b'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          // Stop all camera tracks
          if (videoRef.current?.srcObject) {
            const tracks = videoRef.current.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
          }

          // Stop frame capture
          if (frameIntervalRef.current) {
            clearInterval(frameIntervalRef.current);
            frameIntervalRef.current = null;
          }

          // Close WebSocket connection
          if (wsHandlerRef.current) {
            wsHandlerRef.current.disconnect();
            wsHandlerRef.current = null;
          }

          // Clear connection state
          setConnected(false);
          setIsVideoReady(false);

          // Clear auth data and navigate
          authService.logout();
          navigate('/login', { replace: true });
        } catch (error) {
          console.error('Logout cleanup error:', error);
          // Still proceed with logout even if cleanup fails
          authService.logout();
          navigate('/login', { replace: true });
        }
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
              {videoInitError ? (
                <div className="error-message">{videoInitError}</div>
              ) : (
                <p>Please ensure your camera is enabled and wait while we connect you to the exam session...</p>
              )}
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
                    <div className="action-buttons">
                      <button onClick={() => logout } className="return-btn">
                        End Exam and logout
                      </button>
                    </div>
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
      {/* New fixed logout button */}
      <button onClick={handleLogout} className="logout-fixed">Logout</button>
    </div>
  );
};

export default Dashboard;
