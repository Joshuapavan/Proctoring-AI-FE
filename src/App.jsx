import React, { useEffect, useRef, useState } from "react";
import Actions from './Actions';
import './App.css';
import Logs from './Logs';

const Proctoring = () => {
  const videoRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const ws = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [videoOn, setVideoOn] = useState(true);
  const [actionCount, setActionCount] = useState(0);
  const [dropped, setDropped] = useState(false);

  const connectWebSocket = () => {
    ws.current = new WebSocket("ws://127.0.0.1:8000/ws");

    ws.current.onopen = () => {
      console.log("WebSocket connection opened");
      setWsConnected(true);
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("Received data:", data);
      if (data.logs) {
        console.log("Logs received:", data.logs);
        setLogs((prevLogs) => [...prevLogs, ...data.logs]);
        if (data.logs.some(log => log.event.includes("phone detected"))) {
          incrementActionCount();
        }
      }
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      setWsConnected(false);
    };

    ws.current.onclose = () => {
      console.log("WebSocket connection closed");
      setWsConnected(false);
      setTimeout(connectWebSocket, 1000); // Retry connection after 1 second
    };
  };

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  useEffect(() => {
    // Start video stream
    if (videoRef.current && videoOn) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          console.log("Webcam stream started");
          videoRef.current.srcObject = stream;
        })
        .catch((error) => console.error("Error accessing webcam:", error));
    } else if (videoRef.current && !videoOn) {
      const stream = videoRef.current.srcObject;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, [videoOn]);

  const sendFrames = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Capture video frames and send to the backend
    setInterval(() => {
      if (videoRef.current && ws.current.readyState === WebSocket.OPEN) {
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (blob) {
            blob.arrayBuffer().then((buffer) => {
              console.log("Sending frame to backend");
              ws.current.send(buffer);
            });
          }
        }, "image/jpeg");
      }
    }, 100); // Send frames every 100ms (~10 FPS)
  };

  const toggleVideo = () => {
    setVideoOn((prev) => !prev);
  };

  const dropFromExam = () => {
    if (ws.current) {
      ws.current.close();
    }
    alert("You have been dropped from the exam.");
    setDropped(true);
  };

  const incrementActionCount = () => {
    setActionCount(prevCount => {
      const newCount = prevCount + 1;
      if (newCount >= 3) {
        dropFromExam();
      }
      return newCount;
    });
  };

  const handlePaste = () => {
    incrementActionCount();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      incrementActionCount();
    }
  };

  useEffect(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (dropped) {
    return (
      <div className="thank-you-screen">
        <h1>Thank you for participating in the exam.</h1>
      </div>
    );
  }

  return (
    <div className="proctoring-container">
      <div className="video-container">
        <video ref={videoRef} autoPlay playsInline muted onPlay={sendFrames} />
      </div>
      <div className="right-container">
        <Logs logs={logs} />
        <input type="text" className="textBox" onPaste={handlePaste} />
        <Actions toggleVideo={toggleVideo} dropFromExam={dropFromExam} videoOn={videoOn} />
      </div>
    </div>
  );
};

export default Proctoring;
