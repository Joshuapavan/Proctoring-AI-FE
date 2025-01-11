import React from 'react';
import './App.css';

const Logs = ({ logs }) => {
  return (
    <div className="logs-container">
      <h2>Logs : </h2>
      <ul>
        {logs.map((log, index) => (
          <li key={index} style={{ marginBottom: "10px" }}>
            <strong>{new Date(log.time).toLocaleTimeString()}:</strong> {log.event}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Logs;
