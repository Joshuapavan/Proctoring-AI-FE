import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import 'sweetalert2/dist/sweetalert2.css';
import { authService } from '../services/authService';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);

  React.useEffect(() => {
    // Check if already authenticated
    const token = localStorage.getItem('token')?.trim();
    const userId = localStorage.getItem('userId');
    if (token && userId) {
        navigate('/exam', { replace: true });
    }
  }, [navigate]);

  const handleLoginSuccess = async (data) => {
    try {
        await authService.setAuth(data);
        
        await Swal.fire({
            icon: 'success',
            title: 'Login Successful',
            text: 'Redirecting to dashboard...',
            timer: 1500,
            showConfirmButton: false,
            background: '#2a2a2a',
            color: '#fff'
        });

        navigate('/exam', { replace: true });
    } catch (error) {
        console.error('Login error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Login Error',
            text: error.message,
            background: '#2a2a2a',
            color: '#fff'
        });
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await authService.loginWithPassword({ email, password });
      await handleLoginSuccess(data);
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Login Failed',
        text: err.message,
        background: '#2a2a2a',
        color: '#fff',
        confirmButtonColor: '#646cff'
      });
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
        };
        setShowCamera(true);
        setError('');
      }
    } catch (err) {
      console.error('Camera error:', err);
      setError('Failed to access camera. Please ensure camera permissions are granted.');
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !videoRef.current.srcObject) {
      setError('Camera not initialized');
      return;
    }
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      ctx.drawImage(videoRef.current, 0, 0);
      
      canvas.toBlob(blob => {
        if (!blob) {
          setError('Failed to capture image');
          return;
        }
        setCapturedImage(blob);
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.8));
      }, 'image/jpeg', 0.8);

    } catch (err) {
      console.error('Capture error:', err);
      setError('Failed to capture image');
    }
  };

  const handleFaceLogin = async () => {
    if (!capturedImage) return;

    const formData = new FormData();
    formData.append('image', capturedImage);

    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/login/face`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Face login failed');
      }
      
      handleLoginSuccess(data);
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Face Login Failed',
        text: err.message === 'Face not recognized' ? 'Face not recognized. Please try again.' : err.message,
        background: '#2a2a2a',
        color: '#fff',
        confirmButtonColor: '#646cff'
      });
    } finally {
      setLoading(false);
      setShowCamera(false);
      setCapturedImage(null);
      setPreviewUrl('');
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  // Add cleanup on component unmount
  React.useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>Login</h2>
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handlePasswordLogin}>
          <div className="form-group">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Loading...' : 'Login with Password'}
          </button>
        </form>

        <div className="divider">OR</div>

        <button 
          onClick={() => {
            setIsModalOpen(true);
            startCamera();
          }} 
          className="face-auth-btn"
        >
          Login with Face
        </button>

        <div className="auth-links">
          <p>Don't have an account?{' '}
            <button 
              onClick={() => navigate('/signup')} 
              className="link-button"
              type="button"
            >
              Sign up
            </button>
          </p>
        </div>

        <Modal 
          isOpen={isModalOpen} 
          onClose={() => {
            setIsModalOpen(false);
            stopCamera();
          }}
        >
          <div className="camera-preview-container">
            {!previewUrl ? (
              <>
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline
                  muted
                  width="100%"
                  height="300"
                />
                <div className="camera-controls">
                  <button onClick={handleCapture} className="capture-btn">
                    Capture
                  </button>
                  <button 
                    onClick={() => {
                      stopCamera();
                      setIsModalOpen(false);
                    }} 
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <img src={previewUrl} alt="Captured" className="preview-image" />
                <div className="preview-actions">
                  <button onClick={() => {
                    setCapturedImage(null);
                    setPreviewUrl('');
                  }}>
                    Retake
                  </button>
                  <button onClick={handleFaceLogin} disabled={loading}>
                    {loading ? 'Processing...' : 'Login with this image'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default Login;