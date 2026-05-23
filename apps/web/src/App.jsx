
import React from 'react';
import { Route, Routes, BrowserRouter as Router, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext.jsx';
import { SettingsProvider } from '@/contexts/SettingsContext.jsx';
import { ChatProvider } from '@/contexts/ChatContext.jsx';
import { FeedbackProvider } from '@/contexts/FeedbackContext.jsx';
import ScrollToTop from '@/components/ScrollToTop.jsx';
import ProtectedRoute from '@/components/ProtectedRoute.jsx';
import { Toaster } from 'sonner';

// Public Pages
import HomePage from '@/pages/HomePage.jsx';
import LoginPage from '@/pages/LoginPage.jsx';
import CustomerSignupPage from '@/pages/CustomerSignupPage.jsx';
import NotFoundPage from '@/pages/NotFoundPage.jsx';
import ThankYouPage from '@/pages/ThankYouPage.jsx';
import InfoPage from '@/pages/InfoPage.jsx';

// Protected Feature Pages
import ChatPage from '@/pages/ChatPage.jsx';

// Role: Admin
import AdminDashboard from '@/pages/AdminDashboard.jsx';
import AdminSettingsPage from '@/pages/AdminSettingsPage.jsx';
import AdminUserManagementPage from '@/pages/AdminUserManagementPage.jsx';
import InspectionViewPage from '@/pages/InspectionViewPage.jsx';

// Role: Inspector
import InspectorDashboard from '@/pages/InspectorDashboard.jsx';
import NewInspectionPage from '@/pages/NewInspectionPage.jsx';

// Role: Customer
import CustomerDashboard from '@/pages/CustomerDashboard.jsx';
import AppointmentBookingPage from '@/pages/AppointmentBookingPage.jsx';

function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <FeedbackProvider>
          <ChatProvider>
            <Router>
              <ScrollToTop />
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<CustomerSignupPage />} />
              <Route path="/privacy" element={<InfoPage title="Privacy Policy" settingsKey="privacyPolicy" />} />
              <Route path="/terms"   element={<InfoPage title="Terms of Service" settingsKey="termsOfService" />} />
              <Route path="/about"   element={<InfoPage title="About" settingsKey="aboutInfo" />} />
              
              {/* Shared Authenticated Routes */}
              <Route 
                path="/chat" 
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/chat/:chatId" 
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                } 
              />

              {/* Inspector Routes */}
              <Route
                path="/inspector/dashboard"
                element={
                  <ProtectedRoute requiredRole="inspector">
                    <InspectorDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inspector/new-inspection"
                element={
                  <ProtectedRoute requiredRole="inspector">
                    <NewInspectionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inspector/inspection/:id"
                element={
                  <ProtectedRoute requiredRole="inspector">
                    <InspectionViewPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inspector/inspection/:id/edit"
                element={
                  <ProtectedRoute requiredRole="inspector">
                    <InspectionViewPage />
                  </ProtectedRoute>
                }
              />
              
              {/* Admin Routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Navigate to="/admin/dashboard" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/inspection/:id"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <InspectionViewPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/inspection/:id/edit"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <InspectionViewPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminUserManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/new-inspection"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <NewInspectionPage />
                  </ProtectedRoute>
                }
              />

              {/* Customer Routes */}
              <Route
                path="/customer"
                element={
                  <ProtectedRoute requiredRole="customer">
                    <CustomerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customer/book-appointment"
                element={
                  <ProtectedRoute requiredRole="customer">
                    <AppointmentBookingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customer/profile"
                element={
                  <ProtectedRoute requiredRole="customer">
                    {/* Placeholder for Profile, fallback to dashboard for now */}
                    <Navigate to="/customer" replace />
                  </ProtectedRoute>
                }
              />
              
              {/* Catch-all */}
              <Route path="/thank-you" element={<ThankYouPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <Toaster position="top-right" richColors closeButton />
          </Router>
          </ChatProvider>
        </FeedbackProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

export default App;
