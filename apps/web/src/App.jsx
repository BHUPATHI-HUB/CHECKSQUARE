
import React, { Suspense, lazy } from 'react';
import { Route, Routes, BrowserRouter as Router, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext.jsx';
import { SettingsProvider } from '@/contexts/SettingsContext.jsx';
import { ChatProvider } from '@/contexts/ChatContext.jsx';
import { FeedbackProvider } from '@/contexts/FeedbackContext.jsx';
import { SupabaseAuthProvider } from '@/contexts/SupabaseAuthContext.jsx';
import ScrollToTop from '@/components/ScrollToTop.jsx';
import ProtectedRoute from '@/components/ProtectedRoute.jsx';
import OfflineBanner from '@/components/OfflineBanner.jsx';
import { Toaster } from 'sonner';

// Public pages stay eager-loaded — they're tiny and needed on first paint.
import HomePage from '@/pages/HomePage.jsx';
import LoginPage from '@/pages/LoginPage.jsx';
import NotFoundPage from '@/pages/NotFoundPage.jsx';

// Everything else loads on demand to shrink the initial JS bundle.
// Each lazy() creates its own chunk that's only downloaded when the route
// is visited — dramatically improves first-load time on mobile.
const CustomerSignupPage      = lazy(() => import('@/pages/CustomerSignupPage.jsx'));
const ThankYouPage            = lazy(() => import('@/pages/ThankYouPage.jsx'));
const InfoPage                = lazy(() => import('@/pages/InfoPage.jsx'));
const ChatPage                = lazy(() => import('@/pages/ChatPage.jsx'));
const AdminDashboard          = lazy(() => import('@/pages/AdminDashboard.jsx'));
const AdminSettingsPage       = lazy(() => import('@/pages/AdminSettingsPage.jsx'));
const AdminUserManagementPage = lazy(() => import('@/pages/AdminUserManagementPage.jsx'));
const InspectionViewPage      = lazy(() => import('@/pages/InspectionViewPage.jsx'));
const InspectorDashboard      = lazy(() => import('@/pages/InspectorDashboard.jsx'));
const NewInspectionPage       = lazy(() => import('@/pages/NewInspectionPage.jsx'));
const CustomerDashboard       = lazy(() => import('@/pages/CustomerDashboard.jsx'));
const AppointmentBookingPage  = lazy(() => import('@/pages/AppointmentBookingPage.jsx'));
const DownloadsPage           = lazy(() => import('@/pages/DownloadsPage.jsx'));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
    Loading…
  </div>
);

function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <SupabaseAuthProvider>
        <FeedbackProvider>
          <ChatProvider>
            <Router>
              <ScrollToTop />
              <OfflineBanner />
            <Suspense fallback={<RouteFallback />}>
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
              <Route
                path="/downloads"
                element={
                  <ProtectedRoute>
                    <DownloadsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/thank-you" element={<ThankYouPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
            <Toaster position="top-right" richColors closeButton />
          </Router>
          </ChatProvider>
        </FeedbackProvider>
        </SupabaseAuthProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

export default App;
