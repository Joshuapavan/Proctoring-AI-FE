import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import 'sweetalert2/dist/sweetalert2.css';
import Modal from './Modal';

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

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

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setShowCamera(false);
    }
  };

  React.useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const validateImage = (file) => {
    // Check file type
    if (!file.type.match(/^image\/(jpeg|png)$/)) {
      throw new Error('Only JPEG and PNG images are supported');
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Image size should be less than 5MB');
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        validateImage(file);
        setSelectedImage(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviewUrl(reader.result);
        };
        reader.readAsDataURL(file);
        setError('');
      } catch (err) {
        setError(err.message);
        setSelectedImage(null);
        setImagePreviewUrl('');
      }
    }
  };

  const capturePhoto = () => {
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      try {
        validateImage(blob);
        setSelectedImage(blob);
        setImagePreviewUrl(canvas.toDataURL());
        stopCamera();
        setIsModalOpen(false);
        setError('');
      } catch (err) {
        setError(err.message);
        setSelectedImage(null);
        setImagePreviewUrl('');
      }
    }, 'image/jpeg', 0.9);  // 90% quality JPEG
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!selectedImage) {
      Swal.fire({
        icon: 'error',
        title: 'Image Required',
        text: 'Please provide a face image',
        background: '#2a2a2a',
        color: '#fff',
        confirmButtonColor: '#646cff'
      });
      return;
    }

    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);
    formData.append('image', selectedImage);

    try {
      setLoading(true);
      const response = await fetch('http://localhost:8080/api/v1/auth/signup', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Signup failed');
      }
      
      // Store user id from response if needed
      localStorage.setItem('userId', data.id);
      
      Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: data.message,
        background: '#2a2a2a',
        color: '#fff',
        confirmButtonColor: '#646cff'
      }).then(() => {
        navigate('/');
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'Signup Failed',
        text: err.message,
        background: '#2a2a2a',
        color: '#fff',
        confirmButtonColor: '#646cff'
      });
    } finally {
      setLoading(false);
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h2>Sign Up</h2>
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSignup}>
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
          
          <div className="image-upload-container">
            <h3>Profile Image</h3>
            <div className="option-buttons">
              <button 
                type="button" 
                onClick={() => fileInputRef.current.click()}
                disabled={loading}
              >
                Upload from Device
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setIsModalOpen(true);
                  startCamera();
                }}
                disabled={loading}
              >
                Take Photo
              </button>
            </div>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />

            {imagePreviewUrl && !showCamera && (
              <img src={imagePreviewUrl} alt="Preview" className="preview-image" />
            )}
          </div>
          
          <button 
            type="submit" 
            disabled={loading || (!selectedImage && !showCamera)}
          >
            {loading ? 'Processing...' : 'Sign Up'}
          </button>
        </form>

        <p className="auth-link">
          Already have an account? <a href="/login">Login</a>
        </p>

        <Modal 
          isOpen={isModalOpen} 
          onClose={() => {
            setIsModalOpen(false);
            stopCamera();
          }}
        >
          <div className="camera-preview-container">
            <video 
              ref={videoRef}
              autoPlay 
              playsInline
              muted
              width="100%"
              height="300"
            />
            <div className="camera-controls">
              <button onClick={capturePhoto} className="capture-btn">
                Capture Photo
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
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default Signup;
