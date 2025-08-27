import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import Login from './components/Login';
import Signup from './components/Signup';
import Exam from './components/Exam';
import Summary from './components/Summary';

const ProtectedRoute = ({ children }) => {
    const location = useLocation();
    const [isAuthenticated, setIsAuthenticated] = React.useState(null);

    React.useEffect(() => {
        const checkAuth = () => {
            const token = localStorage.getItem('token')?.trim();
            const userId = localStorage.getItem('userId');
            const isValid = Boolean(token && userId && token !== 'undefined' && token !== 'null');
            setIsAuthenticated(isValid);
        };

        checkAuth();
        // Add event listener for storage changes
        window.addEventListener('storage', checkAuth);
        return () => window.removeEventListener('storage', checkAuth);
    }, []);

    // Show loading or nothing while checking auth
    if (isAuthenticated === null) return null;

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
};

const App = () => {
    return (
        <Provider store={store}>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/exam" element={
                        <ProtectedRoute>
                            < Exam />
                        </ProtectedRoute>
                    } />
                    <Route path="/summary" element={
                        <ProtectedRoute>
                            <Summary />
                        </ProtectedRoute>
                    } />
                    <Route path="/" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        </Provider>
    );
};

export default App;
