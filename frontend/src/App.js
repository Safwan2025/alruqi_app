import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DirectionProvider } from '@radix-ui/react-direction';
import { Toaster } from '@/components/ui/sonner';
import LandingPage from '@/pages/LandingPage';
import WhyUsPage from '@/pages/WhyUsPage';
import StudentsOfWeekPage from '@/pages/StudentsOfWeekPage';
import NewsPage from '@/pages/NewsPage';
import AboutPage from '@/pages/AboutPage';
import LicensePage from '@/pages/LicensePage';
import StartJourneyPage from '@/pages/StartJourneyPage';
import LoginPage from '@/pages/LoginPage';
import AuthCallback from '@/pages/AuthCallback';
import StudentDashboard from '@/pages/StudentDashboard';
import TeacherDashboard from '@/pages/TeacherDashboard';
import TeachersList from '@/pages/TeachersList';
import BookSession from '@/pages/BookSession';
import LiveClassroom from '@/pages/LiveClassroom';
import ProfilePage from '@/pages/ProfilePage';
import CertificateVerificationPage from '@/pages/CertificateVerificationPage';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from '@/components/ScrollToTop';
import '@/App.css';

function AppRouter() {
  const location = useLocation();
  
  // CRITICAL: Check for session_id synchronously during render to prevent race conditions
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/why-us" element={<WhyUsPage />} />
        <Route path="/students-of-week" element={<StudentsOfWeekPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/license" element={<LicensePage />} />
        <Route path="/start" element={<StartJourneyPage />} />
        <Route path="/login" element={<LoginPage />} />
        
        {/* Public Route - Browse Teachers */}
        <Route path="/teachers" element={<TeachersList />} />

        {/* Public Route - Certificate Verification (no login required) */}
        <Route path="/certificate-verification" element={<CertificateVerificationPage />} />
        
        {/* Protected Routes */}
        <Route path="/dashboard/student" element={
          <ProtectedRoute>
            <StudentDashboard />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/teacher" element={
          <ProtectedRoute>
            <TeacherDashboard />
          </ProtectedRoute>
        } />
        <Route path="/book/:teacherId" element={
          <ProtectedRoute>
            <BookSession />
          </ProtectedRoute>
        } />
        <Route path="/classroom/:sessionId" element={
          <ProtectedRoute>
            <LiveClassroom />
          </ProtectedRoute>
        } />
        <Route path="/live-classroom/:sessionId" element={
  <ProtectedRoute>
    <LiveClassroom />
  </ProtectedRoute>
} />
        <Route path="/profile" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />
      </Routes>
      <Toaster position="top-center" richColors />
    </>
  );
}

function App() {
  return (
    <div className="App" dir="rtl">
      <DirectionProvider dir="rtl">
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </DirectionProvider>
    </div>
  );
}

export default App;
