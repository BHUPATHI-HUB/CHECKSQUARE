
import React, { Suspense, lazy, useEffect } from 'react';
import { Route, createBrowserRouter, createRoutesFromElements, RouterProvider, Outlet, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext.jsx';
import { SettingsProvider } from '@/contexts/SettingsContext.jsx';
import { ChatProvider } from '@/contexts/ChatContext.jsx';
import { FeedbackProvider } from '@/contexts/FeedbackContext.jsx';
import { SupabaseAuthProvider } from '@/contexts/SupabaseAuthContext.jsx';
import ScrollToTop from '@/components/ScrollToTop.jsx';
import ProtectedRoute from '@/components/ProtectedRoute.jsx';
import OfflineBanner from '@/components/OfflineBanner.jsx';
import SyncStatusBadge from '@/components/SyncStatusBadge.jsx';
import { startSyncEngine } from '@/services/syncEngine.js';
import { IS_OFFLINE_ADMIN } from '@/lib/appTarget.js';
import { Toaster } from 'sonner';
import { CheckSquare, Home, ScanLine } from 'lucide-react';

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
const AdminActivityPage       = lazy(() => import('@/pages/AdminActivityPage.jsx'));
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

const BrandSplash = ({ visible }) => (
  <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-stone-950 transition-opacity duration-500 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={!visible}>
    <div className="relative flex flex-col items-center gap-5 text-white">
      <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] bg-cyan-500 shadow-[0_20px_60px_rgba(34,211,238,0.28)] motion-safe:animate-[splash-pop_700ms_cubic-bezier(.2,.8,.2,1)_both]">
        <Home className="h-12 w-12" strokeWidth={1.5} />
        <ScanLine className="absolute inset-0 m-auto h-16 w-16 text-cyan-100 opacity-70 motion-safe:animate-pulse" />
        <CheckSquare className="absolute -bottom-2 -right-2 h-9 w-9 rounded-lg bg-stone-950 p-1.5 text-cyan-300" />
      </div>
      <div className="text-center motion-safe:animate-[splash-rise_700ms_120ms_ease-out_both]">
        <p className="text-2xl font-semibold tracking-tight">Check<span className="text-cyan-300">Square</span></p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.28em] text-stone-400">Inspect. Repair. Verify.</p>
      </div>
    </div>
  </div>
);

const RouteShell = () => {
  const { loading } = useAuth();
  const [showSplash, setShowSplash] = React.useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);
  return <>
  <BrandSplash visible={showSplash || loading} />
  <ScrollToTop /><OfflineBanner /><SyncStatusBadge />
  <Suspense fallback={<RouteFallback />}><Outlet /></Suspense>
  <Toaster position="top-right" richColors closeButton />
</>;
};

const router = createBrowserRouter(createRoutesFromElements(
  <Route element={<RouteShell />}>
              {/* Public Routes */}
              <Route path="/" element={IS_OFFLINE_ADMIN ? <Navigate to="/admin/dashboard" replace /> : <HomePage />} />
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
              <Route path="/admin/activity" element={<ProtectedRoute requiredRole="admin"><AdminActivityPage /></ProtectedRoute>} />
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

  </Route>
));

function App() {
  // Kick off the offline sync engine once, app-wide. It drains the outbox on
  // reconnect / foreground / a periodic timer so queued inspections + photos
  // upload automatically when connectivity returns. Skipped entirely in the
  // offline-admin build, which has no cloud to sync to.
  useEffect(() => { if (!IS_OFFLINE_ADMIN) startSyncEngine(); }, []);

  return (
    <SettingsProvider>
      <AuthProvider>
        <SupabaseAuthProvider>
        <FeedbackProvider>
          <ChatProvider>
            <RouterProvider router={router} />

          </ChatProvider>
        </FeedbackProvider>
        </SupabaseAuthProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}

export default App;
