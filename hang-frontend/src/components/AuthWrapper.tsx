'use client';

import React, { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

interface AuthWrapperProps {
  children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const handleShowLogin = () => {
    setAuthMode('login');
    setShowAuth(true);
  };

  const handleShowRegister = () => {
    setAuthMode('register');
    setShowAuth(true);
  };

  const handleCloseAuth = () => {
    setShowAuth(false);
  };

  const switchToLogin = () => {
    setAuthMode('login');
  };

  const switchToRegister = () => {
    setAuthMode('register');
  };

  return (
    <>
      {children}
      
      {showAuth && (
        <>
          {authMode === 'login' ? (
            <LoginForm
              onSwitchToRegister={switchToRegister}
              onClose={handleCloseAuth}
            />
          ) : (
            <RegisterForm
              onSwitchToLogin={switchToLogin}
              onClose={handleCloseAuth}
            />
          )}
        </>
      )}
    </>
  );
}

// Export functions to show auth forms from anywhere in the app
export const showLogin = () => {
  // This will be implemented with a global state or context
  console.log('Show login form');
};

export const showRegister = () => {
  // This will be implemented with a global state or context
  console.log('Show register form');
};
