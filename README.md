
# Proctoring AI Frontend

This project is a frontend application for a Proctoring AI system. It connects to a backend WebSocket server to receive logs and stream video from the user's webcam.

## Setup

Follow these steps to set up and run the project locally:

1. **Clone the repository:**

   ```sh
   git clone https://github.com/Joshuapavan/Proctoring-AI-FE
   ```
2. **Install dependencies:**

   ```sh
   npm install
   ```
3. **Start the development server:**

   ```sh
   npm start
   ```

   The application will be available at `http://localhost:3000`.

## Project Structure

- `src/`
  - `App.jsx`: Main component that sets up the video stream and WebSocket connection.
  - `Logs.jsx`: Component to display logs received from the backend.
  - `Actions.jsx`: Component with buttons to toggle the video and drop from the exam.
  - `index.css`: Global CSS styles.
  - `App.css`: Component-specific CSS styles.
  - `main.jsx`: Entry point of the application.

## How It Works

1. **WebSocket Connection:**

   - The frontend connects to a WebSocket server at `ws://127.0.0.1:8000/ws`.
   - Logs received from the server are displayed in the `Logs` component.
   - The connection is automatically retried if it is closed.
2. **Video Streaming:**

   - The user's webcam stream is displayed in the `video` element.
   - Video frames are captured and sent to the backend every 100ms.
3. **Actions:**

   - The `Actions` component provides buttons to toggle the video stream and drop from the exam.

## Available Scripts

In the project directory, you can run:

- `npm start`: Runs the app in the development mode.
- `npm build`: Builds the app for production to the `build` folder.

## License

This project is licensed under the MIT License.
