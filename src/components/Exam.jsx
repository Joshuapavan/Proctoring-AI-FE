import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import 'sweetalert2/dist/sweetalert2.css';
import { examService } from '../services/examService';
import { VideoStreamManager } from '../utils/WebSocketHandler';
import { authService } from '../services/authService';
import { formatTime } from '../utils/timeUtils';
import { handleTabVisibility, getTabSwitchCount, incrementTabSwitchCount } from '../utils/tabVisibility';
import { incrementCopyPasteCount, getCopyPasteCount } from '../utils/copyPasteTracker';
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

const Exam = () => {
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const wsHandlerRef = useRef(null);
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
  const [warnings, setWarnings] = useState([]);
  const [violationScore, setViolationScore] = useState(100); // Start at 100%
  const [sideAlert, setSideAlert] = useState(null);

  const showSideAlert = (type, attempt) => {
    const newWarning = {
      type: type === 'tab' ? 'Tab Switching' : 'Copy-Paste',
      attempt,
      time: new Date().toLocaleTimeString()
    };
    
    setSideAlert(newWarning);
    const deduction = 10;
    setViolationScore(prev => Math.max(0, prev - deduction));
    
    // Auto clear after 3 seconds
    setTimeout(() => setSideAlert(null), 3000);
  };

  const handleExamViolation = async (type, attempts) => {
    const messages = {
      'tab-switch': 'You have switched tabs too many times.',
      'copy-paste': 'You have attempted to copy-paste too many times.'
    };

    // Store violation data
    localStorage.setItem('examViolations', JSON.stringify({
      type,
      attempts,
      warnings: warnings,
      complianceScore: violationScore
    }));

    try {
      const userId = localStorage.getItem('userId');
      
      Swal.fire({
        title: 'Exam Terminated',
        html: 'Your exam has been terminated due to violations.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: true,
        confirmButtonText: 'OK',
        background: '#2a2a2a',
        color: '#fff'
      }).then(async () => {
        // Clean up video stream
        if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }

        // Close WebSocket connection
        if (wsHandlerRef.current) {
          await wsHandlerRef.current.endSession();
          wsHandlerRef.current = null;
        }

        // Call force-close API
        await examService.forceCloseExam(userId);

        // Log out user
        authService.logout();

        // Refresh the page which will redirect to login due to no token
        window.location.reload();
      });

    } catch (error) {
      console.error('Error during violation handling:', error);
      // Still logout and refresh even if there's an error
      authService.logout();
      window.location.reload();
    }
  };

  const initializeVideo = async (retryCount = 0, maxRetries = 3) => {
    return new Promise(async (resolve) => {
      try {
        if (!videoRef.current) {
          setVideoInitError('Video element not found');
          resolve(false);
          return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          setVideoInitError('Camera access not supported in your browser');
          resolve(false);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 10, max: 15 },
            facingMode: "user"
          }
        });

        if (!stream.active) {
          throw new Error('Camera stream not active');
        }

        videoRef.current.srcObject = stream;
        await new Promise((resolveVideo) => {
          videoRef.current.onloadedmetadata = () => resolveVideo();
          videoRef.current.onerror = () => {
            setVideoInitError('Failed to load video stream');
            resolveVideo();
          };
        });

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

        const videoReady = await initializeVideo();
        if (!videoReady || !isComponentMounted) {
          throw new Error('Video initialization failed');
        }
        setIsVideoReady(true);

        const examResponse = await examService.startExam(userId);
        if (!isComponentMounted) return;

        console.log('Exam session response:', examResponse);

        if (!examResponse.wsUrl) {
          throw new Error('Invalid WebSocket URL received from server');
        }

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
            background: '#2a2a2a',
            color: '#fff'
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

      if (wsRef.current) {
        wsRef.current.close();
        setConnected(false);
      }
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }

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

  const logout = () => {
    authService.logout();
    navigate('/login', { replace: true });
  }

  const pollForSummary = async (userId, maxAttempts = 10, interval = 2000) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/exam/summary/${userId}`);
        const data = await response.json();
        
        if (response.ok && data) {
          return data;
        }
      } catch (error) {
        console.debug('Waiting for summary...', error);
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Failed to get exam summary');
  };

  const handleAnswer = async (answer) => {
    if (answer === javaQuestions[currentQuestion].correct) {
        setScore(score + 1);
    }

    const nextQuestion = currentQuestion + 1;
    if (nextQuestion < javaQuestions.length) {
        setCurrentQuestion(nextQuestion);
    } else {
        if (videoRef.current?.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => {
                track.stop();
            });
            videoRef.current.srcObject = null;
        }
        
        Swal.fire({
            title: 'Processing Results',
            html: 'Please wait while we analyze your exam session...',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            },
            background: '#2a2a2a',
            color: '#fff'
        });

        try {
            if (wsHandlerRef.current) {
                await wsHandlerRef.current.endSession();
            }

            const finalScore = score + (answer === javaQuestions[currentQuestion].correct ? 1 : 0);
            localStorage.setItem('examScore', finalScore);

            const userId = localStorage.getItem('userId');
            const summary = await pollForSummary(userId);
            localStorage.setItem('examSummary', JSON.stringify(summary));

            await Swal.close();
            navigate('/summary');
        } catch (error) {
            console.error('Error during exam completion:', error);
            Swal.update({
                title: 'Processing Results',
                html: 'Please wait while we complete the analysis...',
                showConfirmButton: false
            });
            setTimeout(async () => {
                try {
                    const userId = localStorage.getItem('userId');
                    const summary = await pollForSummary(userId, 1);
                    localStorage.setItem('examSummary', JSON.stringify(summary));
                } catch (finalError) {
                    console.error('Final attempt failed:', finalError);
                }
                await Swal.close();
                navigate('/summary');
            }, 5000);
        }
    }
};

const handleFinishExam = async (isViolation = false) => {
    if (timerRef.current) {
        clearInterval(timerRef.current);
    }

    if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => {
            track.stop();
        });
        videoRef.current.srcObject = null;
    }

    try {
        if (isViolation) {
            const copyPasteAttempts = getCopyPasteCount();
            const tabSwitches = getTabSwitchCount();
            localStorage.setItem('examViolation', JSON.stringify({
                copyPasteAttempts,
                tabSwitches,
                type: copyPasteAttempts >= 3 ? 'copy-paste' : 'tab-switch'
            }));
        }

        Swal.fire({
            title: 'Processing Results',
            html: 'Please wait while we analyze your exam session...',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            },
            background: '#2a2a2a',
            color: '#fff'
        });

        if (wsHandlerRef.current) {
            await wsHandlerRef.current.endSession();
        }
        localStorage.setItem('tabSwitches', getTabSwitchCount());
        localStorage.setItem('examScore', score);

        const userId = localStorage.getItem('userId');
        const summary = await pollForSummary(userId);
        localStorage.setItem('examSummary', JSON.stringify(summary));

        await Swal.close();
        navigate('/summary');
    } catch (error) {
        console.error('Error during exam completion:', error);
        Swal.update({
            title: 'Processing Results',
            html: 'Please wait while we complete the analysis...',
            showConfirmButton: false
        });
        setTimeout(async () => {
            try {
                const userId = localStorage.getItem('userId');
                const summary = await pollForSummary(userId, 1);
                localStorage.setItem('examSummary', JSON.stringify(summary));
            } catch (finalError) {
                console.error('Final attempt failed:', finalError);
            }
            await Swal.close();
            navigate('/summary');
        }, 5000);
    }
};

  const handleLogout = () => {
    Swal.fire({
      title: 'Logout',
      text: 'Are you sure you want to end your session?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#646cff',
      cancelButtonColor: '#e74c3c',
      confirmButtonText: 'Yes, logout',
      background: '#2a2a2a',
      color: '#fff'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          if (videoRef.current?.srcObject) {
            const tracks = videoRef.current.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
          }

          if (frameIntervalRef.current) {
            clearInterval(frameIntervalRef.current);
            frameIntervalRef.current = null;
          }

          if (wsHandlerRef.current) {
            wsHandlerRef.current.disconnect();
            wsHandlerRef.current = null;
          }

          setConnected(false);
          setIsVideoReady(false);

          authService.logout();
          navigate('/login', { replace: true });
        } catch (error) {
          console.error('Logout cleanup error:', error);
          authService.logout();
          navigate('/login', { replace: true });
        }
      }
    });
  };

  useEffect(() => {
    const preventCopyPaste = async (e) => {
      e.preventDefault();
      const attempts = incrementCopyPasteCount();
      console.log('Copy paste attempts:', attempts);
      if (attempts < 3) {
        showSideAlert('copy', attempts);
      } else {
        await handleExamViolation('copy-paste', attempts);
      }
      return false;
    };

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        const attempts = incrementTabSwitchCount();
        console.log('Tab switch attempts:', attempts);
        if (attempts < 3) {
          showSideAlert('tab', attempts);
        } else {
          await handleExamViolation('tab-switch', attempts);
        }
      }
    };

    document.addEventListener('copy', preventCopyPaste);
    document.addEventListener('paste', preventCopyPaste);
    document.addEventListener('cut', preventCopyPaste);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('cut', preventCopyPaste);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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
        {sideAlert && (
          <div className={`side-alert ${sideAlert.isViolation ? 'violation' : ''}`}>
            <div className="alert-header">
              <strong>{sideAlert.type}</strong>
              <span className="alert-time">{sideAlert.time}</span>
            </div>
            {sideAlert.isViolation ? (
              <div className="alert-message">{sideAlert.message}</div>
            ) : (
              <div className="alert-warning">
                Warning {sideAlert.attempt}/3
              </div>
            )}
          </div>
        )}
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

              <div className="violation-test-area">
                <div className="test-input-container">
                  <h4>Copy-Paste Test Area</h4>
                  <input
                    type="text"
                    className="test-input"
                    placeholder="Try copy-pasting text here..."
                    onPaste={(e) => e.preventDefault()}
                  />
                  <small>This area is used to test copy-paste violation detection</small>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <button onClick={handleLogout} className="logout-fixed">Logout</button>
    </div>
  );
};

export default Exam;
