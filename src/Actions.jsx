import React from 'react';
import './App.css';

const Actions = ({ toggleVideo, dropFromExam, videoOn }) => {
  return (
    <div className="bottom-actions">
      <button onClick={toggleVideo}>
        {videoOn ? "Turn Video Off" : "Turn Video On"}
      </button>
      <button onClick={dropFromExam} className="drop">
        Drop from Exam
      </button>
    </div>
  );
};

export default Actions;
